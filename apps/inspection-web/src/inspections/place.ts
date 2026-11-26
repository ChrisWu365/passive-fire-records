const SEPARATOR = ' · ';

/** Where a record is: its level or area when it has one, then the detail the installer typed. */
export function placeOf(record: { areaName: string | null; location: string }): string {
  return record.areaName ? `${record.areaName}${SEPARATOR}${record.location}` : record.location;
}
