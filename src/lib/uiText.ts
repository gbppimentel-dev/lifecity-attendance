// Change ID: LC-UI-COPY-v2
// Messages retain natural sentence case; display statuses use explicit labels.
export function uiMessage(value: string): string { return value }

const statuses: Record<string, string> = {active:"Active",inactive:"Inactive",pending:"Pending",approved:"Approved",declined:"Declined",cancelled:"Cancelled",suspended:"Suspended",completed:"Completed",archived:"Archived",upcoming:"Upcoming",present:"Present",absent:"Absent",checked_in:"Checked In", "in-progress":"In Progress",in_progress:"In Progress",owner:"Owner",admin:"Admin",user:"User",quick:"Quick",detailed:"Detailed",church:"Church",ministry:"Ministry"}
export function uiStatus(value: string): string { return statuses[value] ?? value }
