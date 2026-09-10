import { makeAdapter } from './_engine-ticketplay.mjs';
const a = makeAdapter('zapza');
export const platform = a.platform;
export const fetchAvailability = a.fetchAvailability;
