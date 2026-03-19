export function asArray<T>(value: unknown, defaultValue: T[] = []): T[] {
    if (Array.isArray(value)) return value as T[];
    if (value !== null && value !== undefined) return [value as T];
    return defaultValue;
}

export function asNumber(value: unknown, defaultValue = 0): number {
    return typeof value === 'number' ? value : defaultValue;
}

export function asDateString(value: unknown, defaultValue = window.moment().format('YYYY-MM-DD')): string {
    return typeof value === 'string' ? value : defaultValue;
}
