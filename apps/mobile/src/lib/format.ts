export const dateTime = (value?: string | null) => value && !Number.isNaN(Date.parse(value))
  ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'Not Provided';
export const nameOf = (value: { first_name?: string | null; last_name?: string | null } | null | undefined) => [value?.first_name, value?.last_name].filter(Boolean).join(' ') || 'Member';
export const errorMessage = (error: unknown) => (error as { message?: string })?.message || 'Could not complete this request. Please retry.';
