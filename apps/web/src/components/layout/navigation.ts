import { Code2, Database, GitCompareArrows, Workflow, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: '/veri', label: 'Veri Setleri', icon: Database },
  { to: '/karar-sihirbazi', label: 'Karar Sihirbazı & Varsayım', icon: Workflow },
  { to: '/model-karsilastirma', label: 'Model Karşılaştırma', icon: GitCompareArrows },
  { to: '/kod-rapor', label: 'Kod & Rapor Merkezi', icon: Code2 },
];
