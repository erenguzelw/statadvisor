import { BarChart3, Code2, GitCompareArrows, Workflow, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: '/karar-sihirbazi', label: 'Karar Sihirbazı & Varsayım', icon: Workflow },
  { to: '/model-karsilastirma', label: 'Model Karşılaştırma', icon: GitCompareArrows },
  { to: '/veri-kalitesi', label: 'Veri Kalitesi & Aykırılık', icon: BarChart3 },
  { to: '/kod-rapor', label: 'Kod & Rapor Merkezi', icon: Code2 },
];
