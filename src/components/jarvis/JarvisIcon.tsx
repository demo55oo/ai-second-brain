"use client";

import {
  Brain,
  Megaphone,
  Gear,
  Cpu,
  Target,
  Binoculars,
  PenNib,
  Cards,
  UsersThree,
  Browser,
  ListChecks,
  Article,
  Image,
  VideoCamera,
  FilmSlate,
  CalendarCheck,
  ClipboardText,
  FlowArrow,
  Funnel,
  Code,
  MagnifyingGlass,
  Database,
  PaperPlaneTilt,
  type IconProps,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

const MAP: Record<string, ComponentType<IconProps>> = {
  Brain,
  Megaphone,
  Gear,
  Cpu,
  Target,
  Binoculars,
  PenNib,
  Cards,
  UsersThree,
  Browser,
  ListChecks,
  Article,
  Image,
  VideoCamera,
  FilmSlate,
  CalendarCheck,
  ClipboardText,
  FlowArrow,
  Funnel,
  Code,
  MagnifyingGlass,
  Database,
  PaperPlaneTilt,
};

export default function JarvisIcon({ name, ...props }: { name: string } & IconProps) {
  const Cmp = MAP[name] ?? Brain;
  return <Cmp {...props} />;
}
