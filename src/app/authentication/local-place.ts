import { placeForZone } from '../core/utils/prayer-times';
import { timeZoneCity, timeZoneLabel } from '../core/utils/time-zone';

/** The city a time zone is named after: "Africa/Cairo" -> "Cairo", in Arabic "القاهرة". */
export function cityOfZone(zone: string): string {
  return placeForZone(zone)?.city ?? timeZoneCity(zone);
}

/** "Cairo (GMT+2)"; a zone on Greenwich time reads "London (GMT)", as in the design. */
export function zoneLabel(zone: string): string {
  return timeZoneLabel(zone).replace(/\(GMT\+0\)$/, '(GMT)');
}
