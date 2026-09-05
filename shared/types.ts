export type Role = "edit" | "view";

export type Item = {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  done: boolean;
  cost: number | null;
  position: number;
};

/** What a client knows about the list it has open. The role comes from the token it used. */
export type ListInfo = {
  id: string;
  title: string;
  role: Role;
};

/** The one shape for "this input was accepted, or here is why not". */
export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
