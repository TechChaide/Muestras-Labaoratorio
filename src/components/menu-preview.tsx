'use client';

import type { MenuItem, Role } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getIcon } from '@/lib/icon-map';

interface MenuPreviewProps {
  menuItems: MenuItem[];
  roles: Role[];
}

const Icon = ({ name, className }: { name: string; className?: string }) => {
  const LucideIcon = getIcon(name);
  return <LucideIcon className={className} />;
};

const renderMenuItems = (items: MenuItem[], level = 0) => {
    return (
        <ul className={cn("space-y-1 w-full", level > 0 && "pl-4 mt-1")}>
            {items.map(item => (
                <li key={item.id}>
                    {item.children && item.children.length > 0 ? (
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value={item.id} className="border-b-0">
                                <AccordionTrigger className="hover:no-underline rounded-md px-3 py-2 text-sm font-medium hover:bg-accent/50 [&[data-state=open]]:bg-accent/50">
                                    <div className="flex items-center gap-3">
                                        <Icon name={item.icon} className="h-5 w-5 text-muted-foreground" />
                                        <span>{item.label}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pt-1 pb-0 border-l ml-[18px] border-dashed">
                                    {renderMenuItems(item.children, level + 1)}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    ) : (
                        <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium">
                            <Icon name={item.icon} className="h-5 w-5 text-muted-foreground" />
                            <span>{item.label}</span>
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
};

export function MenuPreview({ menuItems, roles }: MenuPreviewProps) {
    const [selectedRole, setSelectedRole] = useState<string>('viewer');

    const filterMenuByRole = (items: MenuItem[], roleId: string): MenuItem[] => {
        return items.reduce((acc: MenuItem[], item) => {
            const hasAccess = item.roles.includes(roleId);
            
            if (hasAccess) {
                const newItem = { ...item };
                if (item.children) {
                    newItem.children = filterMenuByRole(item.children, roleId);
                }
                acc.push(newItem);
            }
            return acc;
        }, []);
    };
    
    const visibleMenuItems = filterMenuByRole(menuItems, selectedRole);

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
        <Card className="lg:col-span-1">
            <CardHeader>
                <CardTitle>Preview Menu</CardTitle>
                <CardDescription>See how the menu looks for different user roles.</CardDescription>
            </CardHeader>
            <CardContent>
                <Label htmlFor="role-select">Select a role to preview</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger id="role-select" className="mt-2">
                        <SelectValue placeholder="Select a role..." />
                    </SelectTrigger>
                    <SelectContent>
                        {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </CardContent>
        </Card>
        <Card className="lg:col-span-2">
             <CardHeader>
                <CardTitle>
                    Menu for <span className="text-primary">{roles.find(r => r.id === selectedRole)?.name || ''}</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="p-4 rounded-lg bg-card border min-h-[300px] flex items-start">
                    {visibleMenuItems.length > 0 ? (
                        <div className="w-full">
                          {renderMenuItems(visibleMenuItems)}
                        </div>
                    ) : (
                        <div className="w-full text-muted-foreground text-center py-8">
                          <p>No menu items are visible for this role.</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
