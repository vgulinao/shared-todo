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

export type ListInfo = {
  title: string;
  role: Role;
};
