export interface RecurrenceRule {

  frequency:
    'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly';

  interval: number;

  count?: number;

  until?: Date;

  byWeekDays?: number[];
}

export class RecurrenceRuleParser {

  static parse(
    rule: string
  ): RecurrenceRule {

    const parts =
      rule.split(';');

    const map =
      new Map<string, string>();

    for (const part of parts) {

      const [key, value] =
        part.split('=');

      map.set(
        key.toUpperCase(),
        value
      );
    }

    return {

      frequency:
        map.get('FREQ')?.toLowerCase() as any,

      interval:
        Number(
          map.get('INTERVAL') ?? 1
        ),

      count:
        map.has('COUNT')
          ? Number(map.get('COUNT'))
          : undefined,

      until:
        map.has('UNTIL')
          ? new Date(map.get('UNTIL')!)
          : undefined,

      byWeekDays:
        map.has('BYDAY')
          ? map.get('BYDAY')!
            .split(',')
            .map(d =>
              ['SU','MO','TU','WE','TH','FR','SA']
                .indexOf(d)
            )
          : undefined
    };
  }
}