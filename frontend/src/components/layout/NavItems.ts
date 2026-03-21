import { Bot, Compass, Map, User, Users } from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  Icon: typeof Map;
};

export const navItems: NavItem[] = [
  { to: '/', label: 'Map', Icon: Map },
  { to: '/plan', label: 'Discovery', Icon: Compass },
  { to: '/assistant', label: 'Assistant', Icon: Bot },
  { to: '/social', label: 'Social', Icon: Users },
  { to: '/profile', label: 'Profile', Icon: User },
];

