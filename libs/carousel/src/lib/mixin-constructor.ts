//  Type for constructing mixins.
export type Constructor<T = {}> = new (...args: any[]) => T;
