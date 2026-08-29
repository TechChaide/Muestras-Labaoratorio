"use client";

import React, { useEffect, useState } from "react";
import type { Aplicacion, Menu as BackMenu, TipoPermiso, TipoUsuario } from "@/types/interfaces";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { aplicacionService } from '@/services/aplicacion.service';
import { tipoPermisoService } from '@/services/tipoPermiso.service';
import { tipoUsuarioService } from '@/services/tipoUsuario.service';
import { tipoUsuarioAplicacionService } from '@/services/seguridades/tipoUsuarioAplicacion.service';
import { menuService } from '@/services/seguridades/menu.service';
import { permisosService } from '@/services/permisos.service';
import { menuTipoUsuarioService } from '@/services/seguridades/menuTipoUsuario.service';
import { getIcon } from '@/lib/icon-map';

interface AppProfilesFormProps {
  // none for now
}

export default function AppProfilesForm(_props: AppProfilesFormProps) {
  const [apps, setApps] = useState<Aplicacion[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<TipoUsuario[]>([]);
  const [profilesForApp, setProfilesForApp] = useState<TipoUsuario[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);
  const [menuItems, setMenuItems] = useState<
    (BackMenu & { children?: BackMenu[] })[]
  >([]);
  const [tree, setTree] = useState<(BackMenu & { children?: BackMenu[] })[]>(
    []
  );
  const [tipoPermisos, setTipoPermisos] = useState<TipoPermiso[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<number | null>(null);
  const [selectedPermisos, setSelectedPermisos] = useState<number[]>([]);
  const [visibleProfilesForSelectedMenu, setVisibleProfilesForSelectedMenu] =
    useState<TipoUsuario[]>([]);
  const [mtusList, setMtusList] = useState<any[]>([]);
  const [visibleMenuSet, setVisibleMenuSet] = useState<Set<number>>(new Set());
  const [rowPermMap, setRowPermMap] = useState<Record<number, Record<number, boolean>>>({});
  const [allPerms, setAllPerms] = useState<any[]>([]);
  const [savingRow, setSavingRow] = useState<number | null>(null);
  const [savingAssignments, setSavingAssignments] = useState(false);
  // mapa menuId -> registro menu_tipo_usuario (para el perfil seleccionado)
  const [mtusMap, setMtusMap] = useState<Record<number, any>>({});

  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const a = await aplicacionService.getAll();
        setApps(a.data || []);
        const tp = await tipoPermisoService.getAll();
        setTipoPermisos(tp.data || []);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedApp) return;
    const loadForApp = async () => {
      try {
        // load profiles (tipo usuario) - in this project roles are global; may filter by application later
        const prof = await tipoUsuarioService.getAll();
        setProfiles(prof.data || []);
        // load tipo-usuario-aplicacion associations and filter profiles for this app
        const assocResp = await tipoUsuarioAplicacionService.getAll();
        const assocs =
          assocResp && (assocResp as any).data
            ? (assocResp as any).data
            : (assocResp as any);
        const profileIdsForApp = (assocs || [])
          .filter(
            (a: any) => String(a.codigo_aplicacion) === String(selectedApp)
          )
          .map((a: any) => Number(a.codigo_tipo_usuario));
        const filtered = (prof.data || []).filter((p: TipoUsuario) =>
          profileIdsForApp.includes(Number(p.codigo_tipo_usuario))
        );
        setProfilesForApp(filtered);
        // load menus for application
        const menusResp = await menuService.getAll();
        const all =
          menusResp && (menusResp as any).data
            ? (menusResp as any).data
            : (menusResp as any);
        const flat: BackMenu[] = (all || []).filter(
          (m: BackMenu) => String(m.codigo_aplicacion) === String(selectedApp)
        );
        setMenuItems(flat);
        const t = buildTree(flat);
        setTree(t);
        // clear selections when app changes
        setSelectedProfile(null);
        setSelectedMenuId(null);
      } catch (err) {
        console.error("loadForApp", err);
      }
    };
    loadForApp();
  }, [selectedApp]);

  // perfilPermMap ya no se usa a nivel global porque permisos ahora son por menu_tipo_usuario.

  const togglePermiso = (id: number) => {
    setSelectedPermisos((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  };

  // Guardar desde panel derecho (menu seleccionado)
  const handleSave = async () => {
    if (!selectedApp) return toast({ title: "Selecciona aplicación" });
    if (!selectedMenuId)
      return toast({ title: "Selecciona una opción de menú" });
    if (!selectedProfile)
      return toast({ title: "Selecciona un perfil (desde el combo)" });
    if (selectedPermisos.length === 0)
      return toast({ title: "Selecciona al menos un permiso (operación)" });

    try {
      setSavingAssignments(true);
      // refresh current mtus for profile (visibilidad)
      const mtusRespCurrent = await menuTipoUsuarioService.getOpcionesByCodigoTipoUsuario(Number(selectedProfile));
      const mtusCurrent = mtusRespCurrent && (mtusRespCurrent as any).data ? (mtusRespCurrent as any).data : (mtusRespCurrent as any);
      const existingMtusCurrent = (mtusCurrent || []).map((m: any) => Number(m.codigo_menu));
      // Create permiso records for the selected profile
      // For menu_tipo_usuario: create entry for selected menu and parents (solo visibilidad)
      const findById = (id: number) =>
        menuItems.find((m) => m.codigo_menu === id) || null;
      const assignMenuToProfile = async (menuId: number, perfil: number) => {
        const payload = {
          codigo_menu_tipo_usuario: 0,
          estado: "A",
          codigo_menu: menuId,
          codigo_tipo_usuario: perfil,
        } as any;
        await menuTipoUsuarioService.save(payload);
      };

      const toAssign = new Set<number>();
      const collectParents = (id: number | null) => {
        if (!id) return;
        toAssign.add(id);
        const item = findById(id);
        if (item && item.codigo_padre && item.codigo_padre !== 0)
          collectParents(item.codigo_padre as number);
      };
      collectParents(selectedMenuId);

      const toCreateMtus = Array.from(toAssign).filter((mid) => !existingMtusCurrent.includes(mid));
      if (toCreateMtus.length > 0) {
        await Promise.all(
          toCreateMtus.map((mid) =>
            assignMenuToProfile(mid, selectedProfile as number)
          )
        );
      }
      // Reobtener mtus después de posibles creaciones (para conseguir id del menú seleccionado)
      const mtusRespAfterCreate = await menuTipoUsuarioService.getOpcionesByCodigoTipoUsuario(Number(selectedProfile));
      const mtusAfterCreate = mtusRespAfterCreate && (mtusRespAfterCreate as any).data ? (mtusRespAfterCreate as any).data : (mtusRespAfterCreate as any);
      const mtusMapTemp: Record<number, any> = {};
      (mtusAfterCreate || []).forEach((m: any) => { mtusMapTemp[Number(m.codigo_menu)] = m; });
      // Permisos del menú seleccionado
      const leafMtus = mtusMapTemp[Number(selectedMenuId)];
      if (!leafMtus) {
        toast({ title: 'Error', description: 'No se pudo crear la visibilidad del menú.' });
        setSavingAssignments(false);
        return;
      }
      const permsRespCurrent = await permisosService.getAll();
      const permsCurrent = permsRespCurrent && (permsRespCurrent as any).data ? (permsRespCurrent as any).data : (permsRespCurrent as any);
      const existingPermsForMenu: any[] = (permsCurrent || []).filter((p: any) => Number(p.codigo_menu_tipo_usuario) === Number(leafMtus.codigo_menu_tipo_usuario));
      const existingTiposForMenu = existingPermsForMenu.map((p: any) => Number(p.codigo_tipo_permiso));
      const toCreatePerms = selectedPermisos.filter(p => !existingTiposForMenu.includes(p));
      const toDeletePerms = existingTiposForMenu.filter(p => !selectedPermisos.includes(p));
      if (toCreatePerms.length > 0) {
        await Promise.all(toCreatePerms.map(tpId => permisosService.save({ codigo_permiso: 0, estado: 'A', codigo_tipo_permiso: tpId, codigo_menu_tipo_usuario: leafMtus.codigo_menu_tipo_usuario } as any)));
      }
      if (toDeletePerms.length > 0) {
        const delRecords = existingPermsForMenu.filter(r => toDeletePerms.includes(Number(r.codigo_tipo_permiso)));
        if (delRecords.length > 0) await Promise.all(delRecords.map(r => permisosService.delete(Number(r.codigo_permiso))));
      }

      toast({
        title: "Guardado",
        description: "Permisos granulares por menú asignados.",
      });
      // Refrescar estado después de guardar
      try {
        const mtusRespAfter = await menuTipoUsuarioService.getOpcionesByCodigoTipoUsuario(Number(selectedProfile));
        const mtusAfter = mtusRespAfter && (mtusRespAfter as any).data ? (mtusRespAfter as any).data : (mtusRespAfter as any);
        setMtusList(mtusAfter || []);
        const visibleSetAfter = new Set<number>((mtusAfter || []).map((m: any) => Number(m.codigo_menu)));
        setVisibleMenuSet(visibleSetAfter);
        setVisibleProfilesForSelectedMenu(visibleSetAfter.has(Number(selectedMenuId)) ? profilesForApp.filter(p => Number(p.codigo_tipo_usuario) === Number(selectedProfile)) : []);
        const permsRespAfter = await permisosService.getAll();
        const permsAfter = permsRespAfter && (permsRespAfter as any).data ? (permsRespAfter as any).data : (permsRespAfter as any);
        const mtusMapAfter: Record<number, any> = {};
        (mtusAfter || []).forEach((m: any) => { mtusMapAfter[Number(m.codigo_menu)] = m; });
        setMtusMap(mtusMapAfter);
        // permisos para menú seleccionado
        const leaf = mtusMapAfter[Number(selectedMenuId)];
        if (leaf) {
          const permsForLeaf = (permsAfter || []).filter((p: any) => Number(p.codigo_menu_tipo_usuario) === Number(leaf.codigo_menu_tipo_usuario)).map((p: any) => Number(p.codigo_tipo_permiso));
          setSelectedPermisos(Array.from(new Set(permsForLeaf)));
        }
        // reconstruir rowPermMap
        const rpm: Record<number, Record<number, boolean>> = {};
        for (const menu of menuItems) {
          const mtusRow = mtusMapAfter[Number(menu.codigo_menu)];
            rpm[Number(menu.codigo_menu)] = {};
            for (const tp of tipoPermisos) {
              if (!mtusRow) { rpm[Number(menu.codigo_menu)][Number(tp.codigo_tipo_permiso)] = false; continue; }
              const permsForRow = (permsAfter || []).filter((p: any) => Number(p.codigo_menu_tipo_usuario) === Number(mtusRow.codigo_menu_tipo_usuario));
              const has = permsForRow.some((p: any) => Number(p.codigo_tipo_permiso) === Number(tp.codigo_tipo_permiso));
              rpm[Number(menu.codigo_menu)][Number(tp.codigo_tipo_permiso)] = has;
            }
        }
        setRowPermMap(rpm);
      } catch (refreshErr) {
        console.error('refresh after save', refreshErr);
      }
      setSavingAssignments(false);
    } catch (err) {
      console.error("save profiles", err);
      toast({
        title: "Error",
        description: "No se pudieron guardar los permisos",
      });
      setSavingAssignments(false);
    }
  };

  // When a menu option or profile is selected, load assignments using the
  // specialized endpoint per-profile, then cross with permisos to populate
  // visibility and permission checkboxes.
  useEffect(() => {
    const loadAssignments = async () => {
      if (!selectedMenuId) {
        setSelectedPermisos([]);
        setVisibleProfilesForSelectedMenu([]);
        return;
      }

      try {
        if (!selectedProfile) {
          // no profile selected: clear profile-scoped data
          setMtusList([]);
          setVisibleMenuSet(new Set());
          setSelectedPermisos([]);
          setVisibleProfilesForSelectedMenu([]);
          return;
        }

  // fetch the menu options visible for the selected profile (mtus)
        const mtusResp = await menuTipoUsuarioService.getOpcionesByCodigoTipoUsuario(
          Number(selectedProfile)
        );
        const mtus =
          mtusResp && (mtusResp as any).data ? (mtusResp as any).data : (mtusResp as any);
        setMtusList(mtus || []);
  const mtusMapLocal: Record<number, any> = {};
  (mtus || []).forEach((m: any) => { mtusMapLocal[Number(m.codigo_menu)] = m; });
  setMtusMap(mtusMapLocal);

        // visible menu set for this profile
        const visibleSet = new Set<number>((mtus || []).map((m: any) => Number(m.codigo_menu)));
        setVisibleMenuSet(visibleSet);

        // visibleProfilesForSelectedMenu: include the selected profile if it has the menu
        const visibleProfiles = visibleSet.has(Number(selectedMenuId))
          ? profilesForApp.filter((p) => Number(p.codigo_tipo_usuario) === Number(selectedProfile))
          : [];
        setVisibleProfilesForSelectedMenu(visibleProfiles);

        // load permisos (ahora por menu_tipo_usuario) y set de permisos del menú seleccionado
        const permsResp = await permisosService.getAll();
        const perms =
          permsResp && (permsResp as any).data ? (permsResp as any).data : (permsResp as any);
        setAllPerms(perms || []);
        if (selectedMenuId && mtusMapLocal[Number(selectedMenuId)]) {
          const mtusRow = mtusMapLocal[Number(selectedMenuId)];
          const permsForMenu = (perms || []).filter((p: any) => Number(p.codigo_menu_tipo_usuario) === Number(mtusRow.codigo_menu_tipo_usuario)).map((p: any) => Number(p.codigo_tipo_permiso));
          setSelectedPermisos(Array.from(new Set(permsForMenu)));
        } else {
          setSelectedPermisos([]);
        }

        // initialize rowPermMap for each menu item flattened from tree
        const flatten: (BackMenu & { children?: BackMenu[] })[] = [];
        const walk = (items: (BackMenu & { children?: BackMenu[] })[] | undefined) => {
          if (!items) return;
            for (const it of items) {
              flatten.push(it);
              if (it.children && it.children.length) walk(it.children as any);
            }
        };
        walk(tree);
        const rpm: Record<number, Record<number, boolean>> = {};
        for (const it of flatten) {
          rpm[Number(it.codigo_menu)] = {};
          const mtusRow = mtusMapLocal[Number(it.codigo_menu)];
          for (const tp of tipoPermisos) {
            if (!mtusRow) { rpm[Number(it.codigo_menu)][Number(tp.codigo_tipo_permiso)] = false; continue; }
            const permsForRow = (perms || []).filter((p: any) => Number(p.codigo_menu_tipo_usuario) === Number(mtusRow.codigo_menu_tipo_usuario));
            const has = permsForRow.some((p: any) => Number(p.codigo_tipo_permiso) === Number(tp.codigo_tipo_permiso));
            rpm[Number(it.codigo_menu)][Number(tp.codigo_tipo_permiso)] = has;
          }
        }
        setRowPermMap(rpm);
      } catch (err) {
        console.error("load assignments", err);
      }
    };
    loadAssignments();
  }, [selectedMenuId, selectedProfile, profilesForApp]);

  // Recalcular perfiles visibles cuando cambia mtusList (después de un guardado)
  useEffect(() => {
    if (!selectedMenuId || !selectedProfile) return;
    const visibleSet = new Set<number>(mtusList.map((m: any) => Number(m.codigo_menu)));
    setVisibleProfilesForSelectedMenu(
      visibleSet.has(Number(selectedMenuId))
        ? profilesForApp.filter((p) => Number(p.codigo_tipo_usuario) === Number(selectedProfile))
        : []
    );
  }, [mtusList]);

  const renderTree = (nodes: (BackMenu & { children?: BackMenu[] })[]) => (
    <ul className="space-y-1">
      {nodes.map((n) => (
        <li key={n.codigo_menu}>
          <div
            className={`p-2 rounded cursor-pointer ${
              selectedMenuId === n.codigo_menu ? "bg-primary/10" : ""
            }`}
            onClick={() => setSelectedMenuId(n.codigo_menu)}
          >
          <div className="flex items-center gap-2">
              <div className="w-6 h-6">
                {n.icono
                  ? (() => {
                      const Comp = getIcon(n.icono);
                      return <Comp className="h-5 w-5" />;
                    })()
                  : null}
              </div>
              <div>{n.nombre}</div>
            </div>
          </div>
          {n.children && n.children.length > 0 && (
            <div className="pl-4">{renderTree(n.children)}</div>
          )}
        </li>
      ))}
    </ul>
  );

  // helper to build tree from flat list
  const buildTree = (flat: BackMenu[]) => {
    const byId = new Map<number, BackMenu & { children?: BackMenu[] }>();
    for (const m of flat) byId.set(Number(m.codigo_menu), { ...m });
    const roots: (BackMenu & { children?: BackMenu[] })[] = [];
    for (const m of byId.values()) {
      if (!m.codigo_padre || Number(m.codigo_padre) === 0) roots.push(m);
      else {
        const parent = byId.get(Number(m.codigo_padre));
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(m);
        } else roots.push(m);
      }
    }
    return roots;
  };
  return (
    <Card className="max-h-[calc(100vh-6rem)] overflow-auto">
      <CardHeader>
        <CardTitle>Asignar perfiles a opciones de menú</CardTitle>
        <CardDescription>
          Selecciona aplicación, perfil(es), opción de menú y los permisos
          (operaciones) permitidas.
        </CardDescription>
      </CardHeader>
  <CardContent>
        <div className="mb-4">
          <div className="flex flex-col md:flex-row">
            <div />
            <div>
              <Label className="text-sm">Aplicación</Label>
              <Select value={selectedApp || ""} onValueChange={(v) => setSelectedApp(v || null)}>
                <SelectTrigger className="h-7 text-sm w-full">
                  <SelectValue placeholder="Selecciona aplicación" />
                </SelectTrigger>
                <SelectContent>
                  {apps.map((a) => (
                    <SelectItem key={a.codigo_aplicacion} value={String(a.codigo_aplicacion)}>
                      {a.nombre_aplicacion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-x-4">
              <Label className="text-sm">    Perfil</Label>
              <Select value={selectedProfile ? String(selectedProfile) : ""} onValueChange={(v) => setSelectedProfile(v ? Number(v) : null)}>
                <SelectTrigger className="h-7 text-sm w-full">
                  <SelectValue placeholder="Selecciona perfil" />
                </SelectTrigger>
                <SelectContent>
                  {profilesForApp.map((p) => (
                    <SelectItem key={p.codigo_tipo_usuario} value={String(p.codigo_tipo_usuario)}>
                      {p.nombre_tipo_usuario}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <hr />
        <br />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Opción de menú</Label>
            <div className="mt-2 p-2 border rounded max-h-[400px] overflow-auto">
              {tree.length > 0 ? (
                renderTree(tree)
              ) : (
                <div className="text-muted-foreground">No hay opciones</div>
              )}
            </div>
          </div>

          <div>
            <div className="mt-3">
              <Label>Perfiles que ven esta opción</Label>
              <div className=" text-xs text-muted-foreground mt-2 space-y-1 ">
                {visibleProfilesForSelectedMenu.length > 0 ? (
                  visibleProfilesForSelectedMenu.map((p) => (
                    <div key={p.codigo_tipo_usuario} className="text-sm">
                      {p.nombre_tipo_usuario}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">Nadie asignado</div>
                )}
              </div>
            </div>
            <br />
            <hr />
            <br />
            <Label>Permisos (operaciones)</Label>
            <div className="space-y-2 mt-2">
              {tipoPermisos.map((tp) => {
                // Permitir seleccionar permisos mientras exista un menú y un perfil.
                // Tabla permisos solo depende de tipo_usuario y tipo_permiso (no del menú).
                const menuSelected = selectedMenuId ? Number(selectedMenuId) : null;
    // También depende de que el menú esté asignado (menu_tipo_usuario) => visibleMenuSet
                const allowed = menuSelected !== null && selectedProfile !== null && visibleMenuSet.has(menuSelected);
                return (
                  <div key={tp.codigo_tipo_permiso} className="flex items-center gap-2">
                    <Checkbox
                      checked={
      allowed && selectedPermisos.includes(tp.codigo_tipo_permiso)
                      }
                      disabled={!allowed}
                      onCheckedChange={() => {
                        if (!allowed) return;
                        togglePermiso(tp.codigo_tipo_permiso);
                      }}
                    />
                    <div>{tp.nombre_tipo_permiso}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <Button onClick={handleSave} disabled={savingAssignments}>
                {savingAssignments ? 'Guardando...' : 'Guardar asignaciones'}
              </Button>
            </div>
          </div>
        </div>
  </CardContent>
      {/* Editable table: profiles x permisos */}
      <div className="p-4 border-t">
        <h3 className="text-sm font-medium mb-3">
          Matriz de permisos por perfil (para la opción seleccionada)
        </h3>
        {profilesForApp.length === 0 ? (
          <div className="text-muted-foreground">
            No hay perfiles en esta aplicación.
          </div>
        ) : !selectedMenuId ? (
          <div className="text-muted-foreground">
            Selecciona una opción de menú para editar la matriz.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full table-auto border">
              <thead>
                <tr className="bg-muted">
                  <th className="p-2 border">Item (menú)</th>
                  <th className="p-2 border">Visible Para el Usuario</th>
                  {tipoPermisos.map((tp) => (
                    <th key={tp.codigo_tipo_permiso} className="p-2 border">
                      {tp.nombre_tipo_permiso}
                    </th>
                  ))}
                  <th className="p-2 border">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {/** flatten menuItems */}
                {(() => {
                  const flatten: (BackMenu & { children?: BackMenu[] })[] = [];
                  const walk = (
                    items: (BackMenu & { children?: BackMenu[] })[] | undefined
                  ) => {
                    if (!items) return;
                    for (const it of items) {
                      flatten.push(it);
                      if (it.children && it.children.length)
                        walk(it.children as any);
                    }
                  };
                  walk(tree);
                  return flatten.map((item) => (
                    <tr
                      key={item.codigo_menu}
                      className={`hover:bg-muted/30 ${selectedMenuId === item.codigo_menu ? 'bg-green-100' : ''}`}
                    >
                      <td className="p-2 border flex items-center gap-2">
                        <div className="w-6 h-6">
                          {item.icono
                            ? (() => {
                                const Comp = getIcon(item.icono);
                                return (
                                  <Comp className="h-5 w-5" />
                                );
                              })()
                            : null}
                        </div>
                        <div>{item.nombre}</div>
                      </td>
                      <td className="p-2 border text-center">
                        <input
                          type="checkbox"
                          checked={visibleMenuSet.has(Number(item.codigo_menu))}
                          onChange={(e) => {
                            const copy = new Set(visibleMenuSet);
                            if (e.target.checked)
                              copy.add(Number(item.codigo_menu));
                            else copy.delete(Number(item.codigo_menu));
                            setVisibleMenuSet(copy);
                          }}
                        />
                      </td>
                      {tipoPermisos.map((tp) => (
                        <td
                          key={tp.codigo_tipo_permiso}
                          className="p-2 border text-center"
                        >
                          <input
                            type="checkbox"
                            checked={
                              !!(
                                rowPermMap[Number(item.codigo_menu)] &&
                                rowPermMap[Number(item.codigo_menu)][Number(tp.codigo_tipo_permiso)]
                              )
                            }
                            disabled={!visibleMenuSet.has(Number(item.codigo_menu)) || !selectedProfile}
                            onChange={(e) => {
                              if (!selectedProfile) return;
                              if (!visibleMenuSet.has(Number(item.codigo_menu))) return;
                              setRowPermMap((rpm) => {
                                const copy = { ...rpm };
                                copy[Number(item.codigo_menu)] = {
                                  ...(copy[Number(item.codigo_menu)] || {}),
                                };
                                copy[Number(item.codigo_menu)][Number(tp.codigo_tipo_permiso)] = e.target.checked;
                                return copy;
                              });
                            }}
                          />
                        </td>
                      ))}
                      <td className="p-2 border">
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                              if (!selectedProfile) return toast({ title: "Selecciona perfil" });
                              setSavingRow(Number(item.codigo_menu));
                              try {
                                const perfilId = Number(selectedProfile);

                                // refresh current data from server to compute diffs
                                const permsRespCurrent = await permisosService.getAll();
                                const permsCurrent = permsRespCurrent && (permsRespCurrent as any).data ? (permsRespCurrent as any).data : (permsRespCurrent as any);

                                const mtusRespCurrent = await menuTipoUsuarioService.getOpcionesByCodigoTipoUsuario(perfilId);
                                const mtusCurrent = mtusRespCurrent && (mtusRespCurrent as any).data ? (mtusRespCurrent as any).data : (mtusRespCurrent as any);
                                const existingMtusCurrent = (mtusCurrent || []).map((m: any) => Number(m.codigo_menu));

                                // handle mtus: if visibleMenuSet has item and not in existing, create parents; if unchecked and exists, delete
                                const findById = (id: number) => menuItems.find((m) => m.codigo_menu === id) || null;
                                const toAssign = new Set<number>();
                                const collectParents = (id: number | null) => {
                                  if (!id) return;
                                  toAssign.add(id);
                                  const it = findById(id);
                                  if (it && it.codigo_padre && it.codigo_padre !== 0) collectParents(it.codigo_padre as number);
                                };
                                if (visibleMenuSet.has(Number(item.codigo_menu))) {
                                  collectParents(item.codigo_menu);
                                  const toCreateMtus = Array.from(toAssign).filter((mid) => !existingMtusCurrent.includes(mid));
                                  if (toCreateMtus.length > 0) {
                                    await Promise.all(toCreateMtus.map((mid) => menuTipoUsuarioService.save({ codigo_menu_tipo_usuario: 0, estado: 'A', codigo_menu: mid, codigo_tipo_usuario: perfilId } as any)));
                                  }
                                } else {
                                  // delete existing mtus for this specific menu
                                  const mtusToDelete = (mtusCurrent || []).filter((m: any) => Number(m.codigo_tipo_usuario) === perfilId && Number(m.codigo_menu) === Number(item.codigo_menu));
                                  if (mtusToDelete.length > 0) await Promise.all(mtusToDelete.map((m: any) => menuTipoUsuarioService.delete(Number(m.codigo_menu_tipo_usuario))));
                                }

                                // handle permisos per row: compute desired from rowPermMap
                                // obtener/crear mtus para este menú (y padres si hace falta) igual que arriba
                                // luego operar permisos atados al codigo_menu_tipo_usuario de este menú
                                const mtusRespCurrent2 = await menuTipoUsuarioService.getOpcionesByCodigoTipoUsuario(perfilId);
                                const mtusCurrent2 = mtusRespCurrent2 && (mtusRespCurrent2 as any).data ? (mtusRespCurrent2 as any).data : (mtusRespCurrent2 as any);
                                const mtusMap2: Record<number, any> = {};
                                (mtusCurrent2 || []).forEach((m: any) => { mtusMap2[Number(m.codigo_menu)] = m; });
                                const mtusRow = mtusMap2[Number(item.codigo_menu)];
                                if (mtusRow) {
                                  const existingPermsForMenu = (permsCurrent || []).filter((p: any) => Number(p.codigo_menu_tipo_usuario) === Number(mtusRow.codigo_menu_tipo_usuario));
                                  const existingTipos = existingPermsForMenu.map((p: any) => Number(p.codigo_tipo_permiso));
                                  const rowMap = rowPermMap[Number(item.codigo_menu)] || {};
                                  const desiredTipos = Object.entries(rowMap).filter(([, v]) => v).map(([k]) => Number(k));
                                  const toCreate = desiredTipos.filter((tpId) => !existingTipos.includes(tpId));
                                  const toDeleteTipos = existingTipos.filter((tpId: any) => !desiredTipos.includes(tpId));
                                  if (toCreate.length > 0) await Promise.all(toCreate.map(tpId => permisosService.save({ codigo_permiso: 0, estado: 'A', codigo_tipo_permiso: tpId, codigo_menu_tipo_usuario: mtusRow.codigo_menu_tipo_usuario } as any)));
                                  if (toDeleteTipos.length > 0) {
                                    const delRecords = existingPermsForMenu.filter((p: any) => toDeleteTipos.includes(Number(p.codigo_tipo_permiso)));
                                    if (delRecords.length > 0) await Promise.all(delRecords.map((d: any) => permisosService.delete(Number(d.codigo_permiso))));
                                  }
                                }

                                // refresh after successful ops
                                const mtusResp2 = await menuTipoUsuarioService.getOpcionesByCodigoTipoUsuario(perfilId);
                                const mtus2 = mtusResp2 && (mtusResp2 as any).data ? (mtusResp2 as any).data : (mtusResp2 as any);
                                setMtusList(mtus2 || []);
                                const visibleSet2 = new Set<number>((mtus2 || []).map((m: any) => Number(m.codigo_menu)));
                                setVisibleMenuSet(visibleSet2);

                                const permsResp2 = await permisosService.getAll();
                                const perms2 = permsResp2 && (permsResp2 as any).data ? (permsResp2 as any).data : (permsResp2 as any);
                                setAllPerms(perms2 || []);
                                // rebuild rowPermMap basado en menu_tipo_usuario
                                const flatten2: (BackMenu & { children?: BackMenu[] })[] = [];
                                const walk2 = (items: (BackMenu & { children?: BackMenu[] })[] | undefined) => { if (!items) return; for (const it of items) { flatten2.push(it); if (it.children && it.children.length) walk2(it.children as any); } };
                                walk2(tree);
                                const rpm2: Record<number, Record<number, boolean>> = {};
                                for (const it of flatten2) {
                                  rpm2[Number(it.codigo_menu)] = {};
                                  const mtusRow2 = (mtus2 || []).find((m: any) => Number(m.codigo_menu) === Number(it.codigo_menu));
                                  for (const tp of tipoPermisos) {
                                    if (!mtusRow2) { rpm2[Number(it.codigo_menu)][Number(tp.codigo_tipo_permiso)] = false; continue; }
                                    const permsForRow = (perms2 || []).filter((p: any) => Number(p.codigo_menu_tipo_usuario) === Number(mtusRow2.codigo_menu_tipo_usuario));
                                    const has = permsForRow.some((p: any) => Number(p.codigo_tipo_permiso) === Number(tp.codigo_tipo_permiso));
                                    rpm2[Number(it.codigo_menu)][Number(tp.codigo_tipo_permiso)] = has;
                                  }
                                }
                                setRowPermMap(rpm2);

                                toast({ title: 'Guardado', description: `Fila guardada para ${item.nombre}` });
                              } catch (err) {
                                console.error('save menu row', err);
                                toast({ title: 'Error', description: 'No se pudo guardar la fila' });
                              } finally {
                                setSavingRow(null);
                              }
                            }}
                            disabled={(() => {
                              const id = Number(item.codigo_menu);
                              if (savingRow === id) return true; // ya está guardando
                              if (!visibleMenuSet.has(id)) return true; // no visible => no guardar
                              const rowMap = rowPermMap[id] || {};
                              const hasAny = Object.values(rowMap).some(Boolean);
                              return !hasAny; // deshabilitar si no hay al menos un permiso seleccionado
                            })()}
                          >
                            {savingRow === Number(item.codigo_menu) ? 'Guardando...' : 'Guardar fila'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
            {/* bulk save removed: permisos are managed per-row */}
          </div>
        )}
      </div>
    </Card>
  );
}
