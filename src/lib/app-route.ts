export function isChithiPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/chithi";
}

export function withSearch(path: string, search: string): string {
  return search ? `${path}${search}` : path;
}
