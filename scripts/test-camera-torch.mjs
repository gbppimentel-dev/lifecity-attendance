// Focused hardware-independent regression checks. Run: node scripts/test-camera-torch.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const compiled=ts.transpileModule(readFileSync(new URL('../src/lib/cameraTorch.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {readTorch,setCameraTorch}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
function fixture({supports=true,ignored=false,unknown=false,rejectDirect=false}={}){
 let lamp=false,calls=[]
 const track={readyState:'live',getCapabilities:()=>({torch:supports}),getSettings:()=>unknown?{}:{torch:lamp},getConstraints:()=>({deviceId:{exact:'rear'},focusMode:'continuous',torch:lamp}),applyConstraints:async constraints=>{
  calls.push(constraints)
  if(rejectDirect&&'torch' in constraints)throw new Error('Direct constraint not implemented')
  if(!ignored)lamp=constraints.advanced.at(-1).torch
 }}
 const scanner={getRunningTrackCapabilities:track.getCapabilities,getRunningTrackSettings:track.getSettings,applyVideoConstraints:track.applyConstraints}
 return {scanner,track,calls,lamp:()=>lamp}
}
let checks=0
{
 const {scanner,track,calls,lamp}=fixture()
 assert.deepEqual(await setCameraTorch(scanner,track,true),{on:true,verified:true})
 assert.equal(lamp(),true)
 assert.deepEqual(await setCameraTorch(scanner,track,false),{on:false,verified:true})
 assert.equal(lamp(),false)
 assert.deepEqual(calls[0].deviceId,{exact:'rear'})
 assert.equal(calls[0].focusMode,'continuous')
 checks++
}
{
 const {scanner,track,calls}=fixture({rejectDirect:true})
 assert.deepEqual(await setCameraTorch(scanner,track,true),{on:true,verified:true})
 assert.equal(calls.length,2)
 assert.equal('torch' in calls[1],false)
 checks++
}
{
 const {scanner,track}=fixture({ignored:true})
 await assert.rejects(setCameraTorch(scanner,track,true),/did not confirm/)
 checks++
}
{
 const {scanner,track,calls}=fixture({supports:false})
 assert.equal(readTorch(scanner,track).supported,false)
 await assert.rejects(setCameraTorch(scanner,track,true),/unavailable/)
 assert.equal(calls.length,0)
 checks++
}
{
 const {scanner,track}=fixture({unknown:true})
 assert.deepEqual(await setCameraTorch(scanner,track,true),{on:true,verified:false})
 checks++
}
{
 const {scanner,track}=fixture()
 track.getCapabilities=()=>{throw new Error('Optional metadata blocked')}
 track.getSettings=()=>{throw new Error('Optional metadata blocked')}
 assert.deepEqual(readTorch(scanner,track),{supported:true,on:false})
 checks++
}
{
 const {scanner,track,calls}=fixture()
 assert.equal(await setCameraTorch(scanner,track,true,()=>false),null)
 assert.equal(calls.length,0)
 let current=true
 track.applyConstraints=async()=>{current=false}
 assert.equal(await setCameraTorch(scanner,track,true,()=>current),null)
 checks++
}
{
 const {scanner}=fixture()
 assert.deepEqual(await setCameraTorch(scanner,null,true),{on:true,verified:true})
 checks++
}
console.log(`${checks} camera torch regression scenarios passed.`)
