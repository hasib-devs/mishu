export function isChithiPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/chithi";
}
