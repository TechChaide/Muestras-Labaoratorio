'use client';

import type { Dispatch, SetStateAction } from 'react';
import React, { useState } from 'react';
import type { MenuItem } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit, Trash2, GripVertical, CornerDownRight } from 'lucide-react';
import { menuService } from '@/services/seguridades/menu.service';
import { Separator } from '@radix-ui/react-select';
import { getIcon, availableIcons } from '@/lib/icon-map';

const Icon = ({ name, className }: { name: string; className?: string }) => {
  const LucideIcon = getIcon(name);
  return <LucideIcon className={className} />;
};

interface MenuItemFormProps {
    item: Partial<MenuItem> | null;
    parentLabel?: string | null;
    onSave: (item: Partial<MenuItem>) => void;
    onClose: () => void;
}

function MenuItemForm({ item, parentLabel, onSave, onClose }: MenuItemFormProps) {
    const [label, setLabel] = useState(item?.label || '');
    const [path, setPath] = useState(item?.path || '');
    const [icon, setIcon] = useState(item?.icon || 'Minus');
    const [showInlinePicker, setShowInlinePicker] = useState(false);
    // Lista común de iconos para selección rápida
    const commonIcons = availableIcons.slice(0, 20);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ id: item?.id, label, path, icon });
    };
    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>{item?.id ? 'Edit Menu Item' : 'Add New Menu Item'}</DialogTitle>
                {parentLabel && (
                    <div className="text-sm text-muted-foreground mt-1">Insertando hijo en: <strong className="text-primary">{parentLabel}</strong></div>
                )}
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <p className="text-xs text-muted-foreground mt-2">Usa los tokens especiales en este campo si aplica:</p>
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                    <div><strong>"."</strong> — menú raíz (no redirige a página)</div>
                    <div><strong>"|"</strong> — rama/agrupador (no redirige)</div>
                    <div><strong>"/..."</strong> — ruta física que redirecciona a una página (ej: <span className="font-mono">/dashboard/users</span>)</div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div>
                        <Label htmlFor="label">Label</Label>
                        <Input id="label" value={label} onChange={e => setLabel(e.target.value)} required />
                    </div>
                    <div>
                        <Label htmlFor="path">Path</Label>
                        <Input id="path" value={path} onChange={e => setPath(e.target.value)} required />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="icon">Icon Name</Label>
                    <div className="flex items-center gap-2">
                        <Input id="icon" value={icon} onChange={e => setIcon(e.target.value)} placeholder="e.g., Home, Settings" />
                        <div className="p-1 rounded border bg-white/5">
                            <Icon name={icon} className="h-6 w-6" />
                        </div>
                        <Button type="button" variant="outline" onClick={() => setShowInlinePicker(s => !s)}>Choose</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Use any icon name from <a href="https://lucide.dev/icons/" target="_blank" rel="noopener noreferrer" className="underline text-primary">lucide.dev</a> or select one from the quick picker.</p>

                    {showInlinePicker && (
                        <div className="mt-2 grid grid-cols-6 gap-2">
                            {commonIcons.map(name => {
                                const Comp = getIcon(name);
                                return (
                                    <button key={name} type="button" onClick={() => { setIcon(name); setShowInlinePicker(false); }} className="flex flex-col items-center gap-1 p-2 rounded hover:bg-primary/5">
                                        <div className="p-1 border rounded bg-white/5"><Comp className="h-5 w-5" /></div>
                                        <div className="text-xs text-muted-foreground truncate max-w-[80px]">{name}</div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit">Save</Button>
            </DialogFooter>
        </form>
    );
}

interface MenuDesignerProps {
    menuItems: MenuItem[];
    setMenuItems: Dispatch<SetStateAction<MenuItem[]>>;
    selectedApp?: string | null;
    // optional callback to reload the menu tree from backend
    refreshMenus?: () => Promise<void>;
}

export function MenuDesigner({ menuItems, setMenuItems, selectedApp, refreshMenus }: MenuDesignerProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
    const [parentId, setParentId] = useState<string | null>(null);

    const openDialog = (item: Partial<MenuItem> | null, parentId: string | null = null) => {
        setEditingItem(item);
        setParentId(parentId);
        setIsDialogOpen(true);
    };

    const findLabelById = (id: string | null): string | null => {
        if (!id) return null;
        const find = (items: MenuItem[]): MenuItem | null => {
            for (const it of items) {
                if (it.id === id) return it;
                if (it.children) {
                    const r = find(it.children);
                    if (r) return r;
                }
            }
            return null;
        };
        const res = find(menuItems);
        return res ? res.label : null;
    };

    const closeDialog = () => {
        setEditingItem(null);
        setParentId(null);
        setIsDialogOpen(false);
    };

    const [savedDialogOpen, setSavedDialogOpen] = useState(false);
    const [savedMessage, setSavedMessage] = useState('');

    const showSavedDialog = (msg: string) => {
        setSavedMessage(msg);
        setSavedDialogOpen(true);
        setTimeout(() => setSavedDialogOpen(false), 1800);
    };

    const handleSave = async (item: Partial<MenuItem>) => {
        // Helper to update local state after receiving savedId
        const updateLocal = (updated: MenuItem) => {
            if (updated.id) {
                if (menuItems.some(m => m.id === updated.id)) {
                    const update = (items: MenuItem[]): MenuItem[] => items.map(i => {
                        if (i.id === updated.id) return { ...i, ...updated } as MenuItem;
                        if (i.children) return { ...i, children: update(i.children) };
                        return i;
                    });
                    setMenuItems(update(menuItems));
                } else if (parentId) {
                    // insert under parent
                    const add = (items: MenuItem[]): MenuItem[] => items.map(i => {
                        if (i.id === parentId) {
                            return { ...i, children: [...(i.children || []), updated] };
                        }
                        if (i.children) return { ...i, children: add(i.children) };
                        return i;
                    });
                    setMenuItems(add(menuItems));
                } else {
                    setMenuItems([...menuItems, updated]);
                }
            }
        };

        try {
            if (!selectedApp) throw new Error('No application selected');

            // Ensure parent is persisted in backend. If parentId is set, try to get it; if not found, save parent first.
            let parentCodigoPadre: number | null = null;
            if (parentId) {
                const maybeNum = Number(parentId);
                let parentExists = false;
                if (!isNaN(maybeNum)) {
                    try {
                        await menuService.getById(maybeNum);
                        parentExists = true;
                        parentCodigoPadre = maybeNum;
                    } catch { parentExists = false; }
                }

                if (!parentExists) {
                    // find parent locally
                    const findParent = (items: MenuItem[]): MenuItem | null => {
                        for (const it of items) {
                            if (it.id === parentId) return it;
                            if (it.children) {
                                const r = findParent(it.children);
                                if (r) return r;
                            }
                        }
                        return null;
                    };
                    const parentItem = findParent(menuItems);
                    if (parentItem) {
                        const parentPayload: any = {
                            codigo_menu: 0,
                            codigo_padre: null,
                            nombre: parentItem.label,
                            icono: parentItem.icon || 'Minus',
                            path: parentItem.path || '#',
                            estado: 'A',
                            codigo_aplicacion: String(selectedApp),
                        };
                        const pResp = await menuService.save(parentPayload as any);
                        const pSaved = (pResp as any)?.data || pResp;
                        const pSavedId = Number(pSaved.codigo_menu || pSaved.codigo_menu);
                        parentCodigoPadre = pSavedId;

                        // Update parent id in local tree from old id to saved id
                        const replaceId = (items: MenuItem[]): MenuItem[] => items.map(i => {
                            if (i.id === parentId) return { ...i, id: String(pSavedId) } as MenuItem;
                            if (i.children) return { ...i, children: replaceId(i.children) };
                            return i;
                        });
                        setMenuItems(replaceId(menuItems));
                    }
                }
            }

            // Build backend payload for current item
            const payload: any = {
                codigo_menu: item.id && !isNaN(Number(item.id)) ? Number(item.id) : 0,
                codigo_padre: parentCodigoPadre,
                nombre: item.label || '',
                icono: item.icon || 'Minus',
                path: item.path || '#',
                estado: 'A',
                codigo_aplicacion: String(selectedApp),
            };

            const resp = await menuService.save(payload as any);
            const saved = (resp as any)?.data || resp;
            const savedId = Number(saved.codigo_menu || saved.codigo_menu);

            const newItem: MenuItem = {
                id: String(savedId),
                label: payload.nombre,
                path: payload.path,
                icon: payload.icono,
                roles: item.roles || [],
            };

            updateLocal(newItem);
            showSavedDialog('Ítem guardado correctamente');

            // After a successful save, refresh the entire tree from backend if callback provided.
            try {
                if (refreshMenus) await refreshMenus();
            } catch (rerr) {
                console.warn('refresh after save failed', rerr);
            }
        } catch (err: any) {
            console.error('save menu item', err);
            showSavedDialog('Error guardando ítem');
        } finally {
            closeDialog();
        }
    };

    const handleDelete = async (itemId: string) => {
        // If the id can be parsed to a number, try deleting in backend first
        const maybeNum = Number(itemId);
        if (!isNaN(maybeNum)) {
            try {
                await menuService.delete(maybeNum);
                showSavedDialog('Ítem eliminado');
                if (refreshMenus) {
                    try {
                        await refreshMenus();
                        return;
                    } catch (rerr) {
                        console.warn('refresh after delete failed', rerr);
                    }
                }
            } catch (err) {
                console.error('delete menu item', err);
                showSavedDialog('Error eliminando ítem');
                // fallthrough to local removal as fallback
            }
        }

        // fallback: remove locally
        const remove = (items: MenuItem[]): MenuItem[] => 
            items.filter(i => i.id !== itemId).map(i => {
                if (i.children) return { ...i, children: remove(i.children) };
                return i;
            });
        setMenuItems(remove(menuItems));
    };

    const renderMenuItem = (item: MenuItem): React.ReactNode => (
        <div key={item.id} className="group/item">
            <div className="flex items-center bg-card p-2 rounded-lg border my-2 shadow-sm hover:shadow-md transition-shadow group-hover/item:border-primary">
                <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab mr-2" />
                <Icon name={item.icon} className="h-5 w-5 text-muted-foreground mr-3" />
                <div className="flex-grow font-medium text-foreground">{item.label}</div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog({}, item.id)}>
                        <CornerDownRight className="h-4 w-4" />
                         <span className="sr-only">Add Sub-item</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(item)}>
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                        <span className="sr-only">Delete</span>
                    </Button>
                </div>
            </div>
            {item.children && item.children.length > 0 && (
                <div className="pl-6 border-l-2 ml-4 border-dashed">
                    {item.children.map(child => renderMenuItem(child))}
                </div>
            )}
        </div>
    );
    
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                        <CardTitle>Menu Designer</CardTitle>
                        <CardDescription>Build and configure your application's menu structure.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="p-4 rounded-lg bg-secondary/30 min-h-[300px]">
                    {menuItems.map(item => renderMenuItem(item))}
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="sm:max-w-[480px]">
                            {isDialogOpen && <MenuItemForm item={editingItem} parentLabel={findLabelById(parentId)} onSave={handleSave} onClose={closeDialog} />}
                        </DialogContent>
                </Dialog>
                {/* Small floating saved notification */}
                {savedDialogOpen && (
                    <div className="fixed right-6 bottom-24 z-50">
                        <div className="bg-green-600 text-white px-4 py-2 rounded shadow">{savedMessage}</div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
