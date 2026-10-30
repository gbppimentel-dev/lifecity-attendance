import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const ids = {
  owner: id(1),
  admin: id(2),
  user: id(3),
  suspended: id(4),
  scanner: id(5),
  member: id(10),
  otherMember: id(11),
  event: id(20),
  otherEvent: id(21),
  attendance: id(30),
  otherAttendance: id(31),
};

test('attendance Undo installer preserves exact historical records and guards receipts', async (t) => {
  const db = new PGlite();
  const installer = await readFile(
    new URL('../supabase/install-attendance-delete-undo.sql', import.meta.url),
    'utf8',
  );
  const account = async (actor = ids.owner, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor ?? '']);
    await db.query("select set_config('lifecity.attendance_undo_token', '', false)");
    await db.exec(`set role ${role}`);
  };
  const removed = async () =>
    (await db.query('select public.lc_remove_attendance_with_undo($1) result', [ids.attendance]))
      .rows[0].result;
  const restore = async (token) =>
    (await db.query('select public.lc_restore_attendance($1) result', [token])).rows[0].result;
  const stored = async () =>
    (
      await db.query('select to_jsonb(a) result from public.attendance a where id=$1', [
        ids.attendance,
      ])
    ).rows[0]?.result;
  const reset = async () => {
    await db.exec('reset role');
    await db.exec(`
      delete from public.lc_attendance_undo_receipts; delete from public.attendance;
      delete from public.member_branches; delete from public.member_ministries;
      delete from public.members; delete from public.events;
      insert into auth.users(id) values('${ids.scanner}') on conflict do nothing;
      update public.app_accounts set status='active' where user_id='${ids.owner}';
      insert into public.members values
        ('${ids.member}','M-001','Historical','Member','old@example.invalid','09170000001','Historic Group','active'),
        ('${ids.otherMember}','M-002','Other','Member',null,null,null,'active');
      insert into public.events values
        ('${ids.event}','Historic Sunday','2025-01-05T01:00:00Z',null,'Old Venue',true),
        ('${ids.otherEvent}','Other Service','2025-01-08T10:00:00Z',null,null,false);
      insert into public.member_branches values('${ids.member}','${id(40)}');
      insert into public.member_ministries values('${ids.member}','${id(50)}');
      delete from public.test_attendance_activity;
    `);
    await account();
    await db.query(
      `insert into public.attendance(id,member_id,event_id,checked_in_at,status,scanned_by,notes,created_at)
      values($1,$2,$3,'2025-01-05T01:12:13Z','corrected',$4,'Original private note','2025-01-05T01:12:14Z')`,
      [ids.attendance, ids.member, ids.event, ids.scanner],
    );
    return await stored();
  };
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create table public.app_accounts(user_id uuid primary key,role text,status text);
      create function public.lc_has_admin_access() returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.app_accounts where user_id=auth.uid() and status='active' and role in ('owner','admin'))
      $$;
      create type public.member_status as enum('active','inactive');
      create type public.attendance_status as enum('present','corrected');
      create table public.members(id uuid primary key,member_number text,first_name text,last_name text,email text,mobile text,member_group text,status public.member_status);
      create table public.events(id uuid primary key,name text,starts_at timestamptz,ends_at timestamptz,location text,is_sunday_service boolean);
      create table public.branches(id uuid primary key,name text);
      create table public.ministries(id uuid primary key,name text);
      create table public.member_branches(member_id uuid references public.members(id) on delete cascade,branch_id uuid references public.branches(id));
      create table public.member_ministries(member_id uuid references public.members(id) on delete cascade,ministry_id uuid references public.ministries(id));
      create table public.attendance(
        id uuid primary key default gen_random_uuid(),member_id uuid not null references public.members(id) on delete cascade,
        event_id uuid not null references public.events(id),checked_in_at timestamptz not null default now(),
        status public.attendance_status not null default 'present',scanned_by uuid references auth.users(id),notes text,
        created_at timestamptz not null default now(),report_snapshot jsonb not null,unique(member_id,event_id));
      -- This is the deployed v3 trigger from the supplied read-only schema report.
      -- In particular, it ALWAYS replaces a supplied snapshot on INSERT.
      create or replace function public.capture_attendance_snapshot_v3() returns trigger language plpgsql set search_path='public','pg_temp' as $$
      declare m public.members%rowtype; e public.events%rowtype; churches jsonb; ministries jsonb;
      begin
        if TG_OP='UPDATE' then
          if new.report_snapshot is distinct from old.report_snapshot or new.member_id is distinct from old.member_id
            or new.event_id is distinct from old.event_id or new.checked_in_at is distinct from old.checked_in_at then
            raise exception 'Historical attendance details cannot be overwritten. Remove and re-enter an incorrect check-in.';
          end if;
          return new;
        end if;
        select * into m from public.members where id=new.member_id;
        if not found then raise exception 'Member not found or not accessible'; end if;
        select * into e from public.events where id=new.event_id;
        if not found then raise exception 'Service not found or not accessible'; end if;
        select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by lower(b.name),b.id),'[]')
          into churches from public.member_branches mb join public.branches b on b.id=mb.branch_id where mb.member_id=m.id;
        select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',n.name) order by lower(n.name),n.id),'[]')
          into ministries from public.member_ministries mm join public.ministries n on n.id=mm.ministry_id where mm.member_id=m.id;
        new.report_snapshot:=jsonb_build_object(
          'version',1,'source','captured_at_check_in','captured_at',now(),
          'first_name',m.first_name,'last_name',m.last_name,'member_number',m.member_number,
          'email',m.email,'mobile',m.mobile,'member_status',m.status,'member_group',m.member_group,
          'churches',churches,'ministries',ministries,'service_name',e.name,'service_date',e.starts_at,
          'service_end',e.ends_at,'service_location',e.location,'sunday_service',e.is_sunday_service);
        return new;
      end $$;
      create trigger attendance_snapshot_v3 before insert or update on public.attendance for each row execute function public.capture_attendance_snapshot_v3();
      create table public.test_attendance_activity(id serial,operation text,row_data jsonb);
      create function public.test_capture_attendance_activity() returns trigger language plpgsql security definer set search_path='' as $$
      begin
        if TG_OP='DELETE' then insert into public.test_attendance_activity(operation,row_data)values(TG_OP,to_jsonb(old)); return old; end if;
        insert into public.test_attendance_activity(operation,row_data)values(TG_OP,to_jsonb(new)); return new;
      end $$;
      create trigger lc_attendance_activity after insert or delete or update on public.attendance for each row execute function public.test_capture_attendance_activity();
      alter table public.attendance enable row level security;
      create policy lc_admin_access on public.attendance for all to authenticated using(public.lc_has_admin_access())with check(public.lc_has_admin_access());
      create policy lc_admin_guard on public.attendance as restrictive for all to authenticated using(public.lc_has_admin_access())with check(public.lc_has_admin_access());
      grant usage on schema public,auth to authenticated,anon;
      grant select,insert,update,delete on public.attendance to authenticated;
      grant select on public.members,public.events,public.branches,public.ministries,public.member_branches,public.member_ministries to authenticated;
      insert into auth.users values('${ids.owner}'),('${ids.admin}'),('${ids.user}'),('${ids.suspended}'),('${ids.scanner}');
      insert into public.app_accounts values('${ids.owner}','owner','active'),('${ids.admin}','admin','active'),('${ids.user}','user','active'),('${ids.suspended}','admin','suspended');
      insert into public.branches values('${id(40)}','Historic Church');
      insert into public.ministries values('${id(50)}','Historic Ministry');
    `);
    const beforePolicy = (
      await db.query(
        "select policyname,permissive,roles,cmd,qual,with_check from pg_policies where tablename='attendance' order by policyname",
      )
    ).rows;
    const beforeCapture = (
      await db.query(
        "select pg_get_functiondef('public.capture_attendance_snapshot_v3()'::regprocedure) definition",
      )
    ).rows[0].definition;
    await db.exec(installer);
    await db.exec(installer);

    await t.test(
      'removal returns every original column and captures a private server receipt',
      async () => {
        const original = await reset();
        const change = await removed();
        assert.deepEqual(change.attendance, original);
        assert.match(change.undo_token, /^[0-9a-f-]{36}$/);
        assert.equal(await stored(), undefined);
        await db.exec('reset role');
        const receipt = (
          await db.query(
            'select *,extract(epoch from(expires_at-created_at))::integer lifetime from public.lc_attendance_undo_receipts',
          )
        ).rows[0];
        assert.deepEqual(receipt.row_data, original);
        assert.equal(receipt.actor_id, ids.owner);
        assert.equal(receipt.lifetime, 86400);
        assert.equal(receipt.restoring, false);
      },
    );

    await t.test(
      'Undo preserves historical snapshot, original IDs, timestamps, scanner and note after profiles change',
      async () => {
        const original = await reset();
        const change = await removed();
        await db.exec('reset role');
        await db.exec(`update public.members set first_name='Changed',email='changed@example.invalid',status='inactive' where id='${ids.member}';
        update public.events set name='Renamed Service',location='New Venue',is_sunday_service=false where id='${ids.event}';
        delete from public.member_branches; delete from public.member_ministries;`);
        await account();
        assert.deepEqual(await restore(change.undo_token), original);
        assert.deepEqual(await stored(), original);
        assert.equal(
          (await db.query("select current_setting('lifecity.attendance_undo_token',true) value"))
            .rows[0].value,
          '',
        );
        await db.exec('reset role');
        const activity = (
          await db.query(
            'select operation,row_data from public.test_attendance_activity order by id',
          )
        ).rows;
        assert.deepEqual(
          activity.map((row) => row.operation),
          ['INSERT', 'DELETE', 'INSERT'],
        );
        assert.deepEqual(
          activity.at(-1).row_data,
          original,
          'existing AFTER activity sees the exact restored historical snapshot',
        );
      },
    );

    await t.test(
      'retry after a confirmed restoration is idempotent with no second insert',
      async () => {
        const original = await reset();
        const change = await removed();
        assert.deepEqual(await restore(change.undo_token), original);
        assert.deepEqual(await restore(change.undo_token), original);
        await db.exec('reset role');
        assert.equal(
          (
            await db.query(
              "select count(*)::integer count from public.test_attendance_activity where operation='INSERT'",
            )
          ).rows[0].count,
          2,
        );
      },
    );

    await t.test('a newer check-in for the same member/service is never overwritten', async () => {
      await reset();
      const change = await removed();
      await db.query('insert into public.attendance(id,member_id,event_id) values($1,$2,$3)', [
        ids.otherAttendance,
        ids.member,
        ids.event,
      ]);
      const replacement = (await db.query('select to_jsonb(a) result from public.attendance a'))
        .rows[0].result;
      await assert.rejects(restore(change.undo_token), (error) => error.code === '23505');
      assert.deepEqual(
        (await db.query('select to_jsonb(a) result from public.attendance a')).rows[0].result,
        replacement,
      );
      await db.exec('reset role');
      assert.equal(
        (await db.query('select restoring from public.lc_attendance_undo_receipts')).rows[0]
          .restoring,
        false,
      );
    });

    await t.test('a conflicting reused attendance ID is never changed', async () => {
      await reset();
      const change = await removed();
      await db.query(
        'insert into public.attendance(id,member_id,event_id,notes) values($1,$2,$3,$4)',
        [ids.attendance, ids.otherMember, ids.otherEvent, 'New record'],
      );
      const replacement = await stored();
      await assert.rejects(restore(change.undo_token), (error) => error.code === '40001');
      assert.deepEqual(await stored(), replacement);
    });

    await t.test(
      'an old receipt cannot recreate a subsequently removed or changed restoration',
      async () => {
        await reset();
        const change = await removed();
        await restore(change.undo_token);
        await db.query('update public.attendance set notes=$1 where id=$2', [
          'Later correction',
          ids.attendance,
        ]);
        await assert.rejects(restore(change.undo_token), (error) => error.code === '40001');
        await db.query('delete from public.attendance where id=$1', [ids.attendance]);
        await assert.rejects(restore(change.undo_token), (error) => error.code === '40001');
        assert.equal(await stored(), undefined);
      },
    );

    await t.test('only the original active staff actor may use a receipt', async () => {
      await reset();
      const change = await removed();
      await account(ids.admin);
      await assert.rejects(restore(change.undo_token), (error) => error.code === 'P0002');
      for (const actor of [ids.user, ids.suspended, null]) {
        await account(actor);
        await assert.rejects(restore(change.undo_token), (error) => error.code === '42501');
        await assert.rejects(removed(), (error) => error.code === '42501');
      }
      await account(ids.owner);
      assert.ok(await restore(change.undo_token));
      await account(ids.owner, 'anon');
      await assert.rejects(restore(change.undo_token), (error) => error.code === '42501');
    });

    await t.test('Administrator removals and restoration use their own receipts', async () => {
      const original = await reset();
      await account(ids.admin);
      const change = await removed();
      assert.deepEqual(await restore(change.undo_token), original);
    });

    await t.test(
      'expired receipts, null IDs and unknown tokens fail without creating attendance',
      async () => {
        await reset();
        const change = await removed();
        await db.exec('reset role');
        await db.query(
          "update public.lc_attendance_undo_receipts set expires_at=clock_timestamp()-interval '1 second' where token=$1",
          [change.undo_token],
        );
        await account();
        await assert.rejects(restore(change.undo_token), (error) => error.code === 'P0001');
        await assert.rejects(restore(id(99)), (error) => error.code === 'P0002');
        await assert.rejects(restore(null), (error) => error.code === '22023');
        await assert.rejects(
          db.query('select public.lc_remove_attendance_with_undo(null)'),
          (error) => error.code === '22023',
        );
        assert.equal(await removed(), null);
        assert.equal(await stored(), undefined);
        await db.exec('reset role');
        assert.equal(
          (await db.query('select count(*)::integer count from public.lc_attendance_undo_receipts'))
            .rows[0].count,
          0,
          'next removal prunes expired receipts',
        );
      },
    );

    await t.test(
      'receipt data and restoration state cannot be read or written directly by staff',
      async () => {
        await reset();
        await removed();
        for (const statement of [
          'select * from public.lc_attendance_undo_receipts',
          'delete from public.lc_attendance_undo_receipts',
          'update public.lc_attendance_undo_receipts set restoring=true',
        ])
          await assert.rejects(db.exec(statement), (error) => error.code === '42501');
      },
    );

    await t.test(
      'a copied receipt token alone cannot bypass normal snapshot capture or authorize an insert',
      async () => {
        await reset();
        const change = await removed();
        await db.query("select set_config('lifecity.attendance_undo_token',$1,false)", [
          change.undo_token,
        ]);
        await assert.rejects(
          db.query('insert into public.attendance(id,member_id,event_id) values($1,$2,$3)', [
            ids.attendance,
            ids.member,
            ids.event,
          ]),
          (error) => error.code === '42501',
        );
        assert.equal(await stored(), undefined);
        await db.query("select set_config('lifecity.attendance_undo_token','',false)");
        await db.query(
          'insert into public.attendance(id,member_id,event_id,report_snapshot) values($1,$2,$3,$4)',
          [ids.attendance, ids.member, ids.event, { forged: 'Historical snapshot' }],
        );
        assert.equal((await stored()).report_snapshot.forged, undefined);
        assert.equal((await stored()).report_snapshot.first_name, 'Historical');
      },
    );

    await t.test(
      'deleted member/service/scanner foreign keys cannot be fabricated during Undo',
      async () => {
        for (const relation of ['members', 'events', 'auth.users']) {
          await db.exec('reset role');
          await db.query('insert into auth.users(id) values($1) on conflict do nothing', [
            ids.scanner,
          ]);
          await reset();
          const change = await removed();
          await db.exec('reset role');
          const target =
            relation === 'members' ? ids.member : relation === 'events' ? ids.event : ids.scanner;
          await db.query(
            `delete from ${relation === 'auth.users' ? relation : 'public.' + relation} where id=$1`,
            [target],
          );
          await account();
          await assert.rejects(restore(change.undo_token));
          assert.equal(await stored(), undefined);
        }
      },
    );

    await t.test(
      'other before-insert guards are never bypassed and a later snapshot rewrite rolls back',
      async () => {
        for (const phase of ['before_restore', 'after_restore']) {
          await reset();
          const change = await removed();
          await db.exec('reset role');
          const trigger =
            phase === 'before_restore' ? 'y_test_attendance_guard' : 'zzz_test_attendance_guard';
          await db.exec(`create function public.test_attendance_guard() returns trigger language plpgsql as $$
          begin
            if nullif(current_setting('lifecity.attendance_undo_token',true),'') is not null then
              ${phase === 'before_restore' ? "new.notes:='Another guard changed notes';" : 'new.report_snapshot:=\'{"changed":true}\'::jsonb;'}
            end if;
            return new;
          end $$;
          create trigger ${trigger} before insert on public.attendance for each row execute function public.test_attendance_guard();`);
          await account();
          await assert.rejects(restore(change.undo_token), (error) => error.code === '40001');
          assert.equal(await stored(), undefined);
          assert.equal(
            (await db.query("select current_setting('lifecity.attendance_undo_token',true) value"))
              .rows[0].value,
            '',
          );
          await db.exec('reset role');
          const receipt = (
            await db.query('select restoring,restored_at from public.lc_attendance_undo_receipts')
          ).rows[0];
          assert.equal(receipt.restoring, false);
          assert.equal(receipt.restored_at, null);
          assert.equal(
            (
              await db.query(
                "select count(*)::integer count from public.test_attendance_activity where operation='INSERT'",
              )
            ).rows[0].count,
            1,
          );
          await db.exec(
            `drop trigger ${trigger} on public.attendance; drop function public.test_attendance_guard()`,
          );
        }
      },
    );

    await t.test(
      'existing snapshot guards and RLS definitions are unchanged by installation',
      async () => {
        await db.exec('reset role');
        assert.deepEqual(
          (
            await db.query(
              "select policyname,permissive,roles,cmd,qual,with_check from pg_policies where tablename='attendance' order by policyname",
            )
          ).rows,
          beforePolicy,
        );
        assert.equal(
          (
            await db.query(
              "select pg_get_functiondef('public.capture_attendance_snapshot_v3()'::regprocedure) definition",
            )
          ).rows[0].definition,
          beforeCapture,
        );
        const receiptPolicies = (
          await db.query("select * from pg_policies where tablename='lc_attendance_undo_receipts'")
        ).rows;
        assert.equal(receiptPolicies.length, 0);
        const triggerFunction = (
          await db.query(
            "select prosecdef,proconfig from pg_proc where oid='public.lc_apply_attendance_undo_snapshot()'::regprocedure",
          )
        ).rows[0];
        assert.equal(triggerFunction.prosecdef, true);
        assert.deepEqual(triggerFunction.proconfig, ['search_path=""']);
      },
    );
  } finally {
    await db.close();
  }
});
