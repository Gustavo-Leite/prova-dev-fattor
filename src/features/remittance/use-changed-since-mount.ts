import { useState } from "react";

export interface MountSnapshot<T> {
  readonly value: T;
}

export type IsSameSnapshot<T> = (mounted: T, current: T) => boolean;

export interface ChangedSinceMountOptions<T> {
  readonly isSame?: IsSameSnapshot<T>;
  readonly changedOnMount?: boolean;
}

export function settleMountSnapshot<T>(
  snapshot: MountSnapshot<T> | null,
  current: T,
  isSame: IsSameSnapshot<T> = Object.is,
): MountSnapshot<T> | null {
  if (snapshot === null || !isSame(snapshot.value, current)) {
    return null;
  }
  return snapshot;
}

export function useChangedSinceMount<T>(
  current: T,
  { isSame = Object.is, changedOnMount = false }: ChangedSinceMountOptions<T> = {},
): boolean {
  const [snapshot, setSnapshot] = useState<MountSnapshot<T> | null>(() =>
    changedOnMount ? null : { value: current },
  );
  const settled = settleMountSnapshot(snapshot, current, isSame);
  if (settled !== snapshot) {
    setSnapshot(settled);
  }
  return settled === null;
}
