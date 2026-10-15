import { Code2, Grid3x3, Database, GitCompareArrows, Split, TrendingUp, Workflow, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: '/veri', label: 'Veri Setleri', icon: Database },
  { to: '/karar-sihirbazi', label: 'Karar Sihirbazı & Varsayım', icon: Workflow },
  { to: '/regresyon', label: 'Doğrusal Regresyon', icon: TrendingUp },
  { to: '/faktoriyel-anova', label: 'Faktöriyel ANOVA', icon: Grid3x3 },
  { to: '/lojistik-regresyon', label: 'Lojistik Regresyon', icon: Split },
  { to: '/model-karsilastirma', label: 'Model Karşılaştırma', icon: GitCompareArrows },
  { to: '/kod-rapor', label: 'Kod & Rapor Merkezi', icon: Code2 },
];
