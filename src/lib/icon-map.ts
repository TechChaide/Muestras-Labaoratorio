// Importar TODOS los iconos de lucide-react
import * as lucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Obtiene un icono de lucide-react por su nombre
 * Si el icono no existe, devuelve el icono Minus por defecto
 */
export function getIcon(iconName: string | undefined): LucideIcon {
  if (!iconName) return lucideIcons.Minus as LucideIcon;
  
  const icon = (lucideIcons as any)[iconName] as LucideIcon | undefined;
  if (!icon) {
    console.warn(`Icon "${iconName}" not found. Using default icon.`);
    return lucideIcons.Minus as LucideIcon;
  }
  
  return icon;
}

/**
 * Lista de iconos comunes para selección
 */
export const availableIcons = [
  'Home',
  'Settings',
  'Menu',
  'User',
  'Users',
  'Shield',
  'Minus',
  'Folder',
  'FileText',
  'Search',
  'PlusCircle',
  'BarChart3',
  'Clock',
  'AlertCircle',
  'CheckCircle',
  'XCircle',
  'Eye',
  'EyeOff',
  'Mail',
  'Phone',
  'MessageCircle',
  'Bell',
  'Package',
  'Truck',
  'Database',
  'Lock',
  'Unlock',
  'Download',
  'Upload',
  'Trash2',
  'Edit',
  'Copy',
  'Share2',
  'ChevronDown',
  'ChevronUp',
  'ChevronRight',
  'ChevronLeft',
  'ArrowRight',
  'ArrowLeft',
  'Calendar',
  'MapPin',
  'Zap',
  'Heart',
  'Star',
];
