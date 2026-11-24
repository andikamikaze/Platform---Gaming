/** Deklarasi tipe untuk konsumen TypeScript. Runtime tetap di `icons.js`. */
export type IconName = keyof typeof import("./icons.js").paths;

export interface IconOptions {
  size?: number | string;
  className?: string;
  title?: string;
  strokeWidth?: number | string;
}

export declare const paths: Record<string, readonly string[]>;
export declare function iconPaths(name: string): readonly string[];
export declare function iconSVG(name: string, options?: IconOptions): string;
export declare function hydrateIcons(root?: ParentNode | null): void;
export declare function setIcon(node: Element | null, name: string): void;
