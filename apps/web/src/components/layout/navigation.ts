import { Code2, Database, Split, TrendingUp, Workflow, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: '/veri', label: 'Veri Setleri', icon: Database },
  { to: '/karar-sihirbazi', label: 'Karar Sihirbazı & Varsayım', icon: Workflow },
  { to: '/regresyon', label: 'Doğrusal Regresyon', icon: TrendingUp },
  { to: '/lojistik-regresyon', label: 'Lojistik Regresyon', icon: Split },
  { to: '/kod-rapor', label: 'Kod & Rapor Merkezi', icon: Code2 },
];
