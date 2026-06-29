import Link from "next/link";
import type { ReactNode } from "react";

import { VsIcon } from "../../_components/vs-icon";

type AccessControlTab = "roles" | "permissions";

type AccessControlNavHeaderProps = {
  activeTab: AccessControlTab;
  title: string;
  breadcrumbCurrent: string;
  rightAction?: ReactNode;
};

const ACCESS_CONTROL_TABS: readonly {
  key: AccessControlTab;
  href: string;
  icon: string;
  label: string;
}[] = [
  {
    key: "roles",
    href: "/admin/roles",
    icon: "group",
    label: "Danh sách Vai trò",
  },
  {
    key: "permissions",
    href: "/admin/permissions",
    icon: "verified_user",
    label: "Danh sách Quyền hạn",
  },
];
