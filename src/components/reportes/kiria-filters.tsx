"use client";

import { useState } from "react";
import { Label } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function KiriaFilters({
  salones,
  lugares,
  salonInicial,
  lugarInicial,
}: {
  salones: { id: string; nombre: string }[];
  lugares: string[];
  salonInicial?: string;
  lugarInicial?: string;
}) {
  const [salon, setSalon] = useState(salonInicial ?? "all");

  return <>
    <div className="xl:min-w-0 xl:flex-[1_1_130px]">
      <Label htmlFor="salon">Salon</Label>
      <Select name="salon" value={salon} onValueChange={setSalon}>
        <SelectTrigger id="salon"><SelectValue placeholder="Todos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {salones.map((item) => <SelectItem key={item.id} value={item.id}>{item.nombre}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    {salon === "kiria" ? <div className="xl:min-w-0 xl:flex-[1_1_130px]">
      <Label htmlFor="lugar">Lugar de Kiria</Label>
      <Select name="lugar" defaultValue={lugarInicial ?? "all"}>
        <SelectTrigger id="lugar"><SelectValue placeholder="Todos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {lugares.map((lugar) => <SelectItem key={lugar} value={lugar.trim().toLocaleLowerCase("es-AR")}>{lugar}</SelectItem>)}
          <SelectItem value="__sin_lugar__">Sin especificar</SelectItem>
        </SelectContent>
      </Select>
    </div> : null}
  </>;
}
