export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      actualizaciones_ipc: {
        Row: {
          created_at: string
          evento_servicio_id: string
          fecha_ajuste: string
          fecha_inicio: string
          id: string
          indec_mes_ajuste: number | null
          indec_mes_anterior: number | null
          ipc_indice_id: string | null
          porcentaje_aplicado: number | null
          tipo: Database["public"]["Enums"]["tipo_actualizacion"]
          usuario_id: string | null
          valor_ajustado: number
          valor_inicial: number
        }
        Insert: {
          created_at?: string
          evento_servicio_id: string
          fecha_ajuste: string
          fecha_inicio: string
          id?: string
          indec_mes_ajuste?: number | null
          indec_mes_anterior?: number | null
          ipc_indice_id?: string | null
          porcentaje_aplicado?: number | null
          tipo?: Database["public"]["Enums"]["tipo_actualizacion"]
          usuario_id?: string | null
          valor_ajustado: number
          valor_inicial: number
        }
        Update: {
          created_at?: string
          evento_servicio_id?: string
          fecha_ajuste?: string
          fecha_inicio?: string
          id?: string
          indec_mes_ajuste?: number | null
          indec_mes_anterior?: number | null
          ipc_indice_id?: string | null
          porcentaje_aplicado?: number | null
          tipo?: Database["public"]["Enums"]["tipo_actualizacion"]
          usuario_id?: string | null
          valor_ajustado?: number
          valor_inicial?: number
        }
        Relationships: [
          {
            foreignKeyName: "actualizaciones_ipc_evento_servicio_id_fkey"
            columns: ["evento_servicio_id"]
            isOneToOne: false
            referencedRelation: "evento_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actualizaciones_ipc_ipc_indice_id_fkey"
            columns: ["ipc_indice_id"]
            isOneToOne: false
            referencedRelation: "ipc_indices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actualizaciones_ipc_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      ipc_indices: {
        Row: {
          created_at: string
          id: string
          periodo: string
          usuario_id: string
          variacion_porcentual: number
        }
        Insert: {
          created_at?: string
          id?: string
          periodo: string
          usuario_id: string
          variacion_porcentual: number
        }
        Update: {
          created_at?: string
          id?: string
          periodo?: string
          usuario_id?: string
          variacion_porcentual?: number
        }
        Relationships: [
          {
            foreignKeyName: "ipc_indices_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          accion: Database["public"]["Enums"]["accion_audit"]
          created_at: string
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          id: string
          registro_id: string
          tabla: string
          usuario_id: string | null
        }
        Insert: {
          accion: Database["public"]["Enums"]["accion_audit"]
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: string
          registro_id: string
          tabla: string
          usuario_id?: string | null
        }
        Update: {
          accion?: Database["public"]["Enums"]["accion_audit"]
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: string
          registro_id?: string
          tabla?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_contratos: {
        Row: {
          cliente_contacto: string | null
          cliente_cuit_dni: string | null
          cliente_nombre: string | null
          cliente_razon_social: string | null
          comision_organizador_monto: number | null
          created_at: string
          deleted_at: string | null
          ejecutiva_id: string | null
          emite_factura: boolean | null
          evento_id: string | null
          factura_concepto: string | null
          factura_contacto_admin: string | null
          factura_cuit: string | null
          factura_direccion: string | null
          factura_razon_social: string | null
          fecha_evento: string | null
          id: string
          iva_comision: number | null
          iva_porcentaje: number | null
          monto_con_factura: number | null
          monto_sin_factura: number | null
          notas: string | null
          pax_adultos: number | null
          pax_bebes: number | null
          pax_comida: number | null
          pax_final: number | null
          pax_jovenes: number | null
          pax_menores: number | null
          pax_post_postre: number | null
          precio_cierre_alimentos_sin_iva: number | null
          precio_cierre_bebidas_sin_iva: number | null
          saldo_pendiente: number | null
          salon_id: string | null
          tipo_evento: string | null
          tipo_servicio: string | null
          total_con_iva: number | null
          total_pagado: number | null
          total_sin_iva: number | null
          updated_at: string
        }
        Insert: {
          cliente_contacto?: string | null
          cliente_cuit_dni?: string | null
          cliente_nombre?: string | null
          cliente_razon_social?: string | null
          comision_organizador_monto?: number | null
          created_at?: string
          deleted_at?: string | null
          ejecutiva_id?: string | null
          emite_factura?: boolean | null
          evento_id?: string | null
          factura_concepto?: string | null
          factura_contacto_admin?: string | null
          factura_cuit?: string | null
          factura_direccion?: string | null
          factura_razon_social?: string | null
          fecha_evento?: string | null
          id?: string
          iva_comision?: number | null
          iva_porcentaje?: number | null
          monto_con_factura?: number | null
          monto_sin_factura?: number | null
          notas?: string | null
          pax_adultos?: number | null
          pax_bebes?: number | null
          pax_comida?: number | null
          pax_final?: number | null
          pax_jovenes?: number | null
          pax_menores?: number | null
          pax_post_postre?: number | null
          precio_cierre_alimentos_sin_iva?: number | null
          precio_cierre_bebidas_sin_iva?: number | null
          saldo_pendiente?: number | null
          salon_id?: string | null
          tipo_evento?: string | null
          tipo_servicio?: string | null
          total_con_iva?: number | null
          total_pagado?: number | null
          total_sin_iva?: number | null
          updated_at?: string
        }
        Update: {
          cliente_contacto?: string | null
          cliente_cuit_dni?: string | null
          cliente_nombre?: string | null
          cliente_razon_social?: string | null
          comision_organizador_monto?: number | null
          created_at?: string
          deleted_at?: string | null
          ejecutiva_id?: string | null
          emite_factura?: boolean | null
          evento_id?: string | null
          factura_concepto?: string | null
          factura_contacto_admin?: string | null
          factura_cuit?: string | null
          factura_direccion?: string | null
          factura_razon_social?: string | null
          fecha_evento?: string | null
          id?: string
          iva_comision?: number | null
          iva_porcentaje?: number | null
          monto_con_factura?: number | null
          monto_sin_factura?: number | null
          notas?: string | null
          pax_adultos?: number | null
          pax_bebes?: number | null
          pax_comida?: number | null
          pax_final?: number | null
          pax_jovenes?: number | null
          pax_menores?: number | null
          pax_post_postre?: number | null
          precio_cierre_alimentos_sin_iva?: number | null
          precio_cierre_bebidas_sin_iva?: number | null
          saldo_pendiente?: number | null
          salon_id?: string | null
          tipo_evento?: string | null
          tipo_servicio?: string | null
          total_con_iva?: number | null
          total_pagado?: number | null
          total_sin_iva?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catering_contratos_ejecutiva_id_fkey"
            columns: ["ejecutiva_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_contratos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_contratos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_anticipacion_reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_contratos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_evento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_contratos_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salones"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_precio_historial: {
        Row: {
          catering_contrato_id: string
          created_at: string
          fecha: string
          id: string
          motivo: string | null
          pax_adultos: number | null
          pax_bebes: number | null
          pax_jovenes: number | null
          pax_menores: number | null
          precio_unitario: number
          usuario_id: string | null
        }
        Insert: {
          catering_contrato_id: string
          created_at?: string
          fecha?: string
          id?: string
          motivo?: string | null
          pax_adultos?: number | null
          pax_bebes?: number | null
          pax_jovenes?: number | null
          pax_menores?: number | null
          precio_unitario: number
          usuario_id?: string | null
        }
        Update: {
          catering_contrato_id?: string
          created_at?: string
          fecha?: string
          id?: string
          motivo?: string | null
          pax_adultos?: number | null
          pax_bebes?: number | null
          pax_jovenes?: number | null
          pax_menores?: number | null
          precio_unitario?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catering_precio_historial_catering_contrato_id_fkey"
            columns: ["catering_contrato_id"]
            isOneToOne: false
            referencedRelation: "catering_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_precio_historial_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_items: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_catering_item"]
          catering_contrato_id: string
          created_at: string
          descripcion: string
          id: string
          orden: number | null
          pax: number | null
          precio_unitario: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          categoria: Database["public"]["Enums"]["categoria_catering_item"]
          catering_contrato_id: string
          created_at?: string
          descripcion: string
          id?: string
          orden?: number | null
          pax?: number | null
          precio_unitario?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_catering_item"]
          catering_contrato_id?: string
          created_at?: string
          descripcion?: string
          id?: string
          orden?: number | null
          pax?: number | null
          precio_unitario?: number | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catering_items_catering_contrato_id_fkey"
            columns: ["catering_contrato_id"]
            isOneToOne: false
            referencedRelation: "catering_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_items_historial: {
        Row: {
          campo_modificado: string
          catering_item_id: string
          created_at: string
          id: string
          motivo: string | null
          usuario_id: string
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo_modificado: string
          catering_item_id: string
          created_at?: string
          id?: string
          motivo?: string | null
          usuario_id: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo_modificado?: string
          catering_item_id?: string
          created_at?: string
          id?: string
          motivo?: string | null
          usuario_id?: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catering_items_historial_catering_item_id_fkey"
            columns: ["catering_item_id"]
            isOneToOne: false
            referencedRelation: "catering_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_items_historial_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      evento_servicios: {
        Row: {
          adicionales_monto: number | null
          comisiona_organizador: boolean
          created_at: string
          evento_id: string
          id: string
          iva_base_imponible: number
          iva_porcentaje: number | null
          notas: string | null
          precio_base: number | null
          proveedor: string | null
          saldo_pendiente: number | null
          servicio_id: string
          total_con_iva: number | null
          total_pagado: number | null
          total_sin_iva: number | null
          updated_at: string
        }
        Insert: {
          adicionales_monto?: number | null
          comisiona_organizador?: boolean
          created_at?: string
          evento_id: string
          id?: string
          iva_base_imponible?: number
          iva_porcentaje?: number | null
          notas?: string | null
          precio_base?: number | null
          proveedor?: string | null
          saldo_pendiente?: never
          servicio_id: string
          total_con_iva?: never
          total_pagado?: number | null
          total_sin_iva?: never
          updated_at?: string
        }
        Update: {
          adicionales_monto?: number | null
          comisiona_organizador?: boolean
          created_at?: string
          evento_id?: string
          id?: string
          iva_base_imponible?: number
          iva_porcentaje?: number | null
          notas?: string | null
          precio_base?: number | null
          proveedor?: string | null
          saldo_pendiente?: never
          servicio_id?: string
          total_con_iva?: never
          total_pagado?: number | null
          total_sin_iva?: never
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_servicios_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_servicios_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_anticipacion_reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_servicios_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_evento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_servicios_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      evento_servicios_historial: {
        Row: {
          campo_modificado: string
          created_at: string
          evento_servicio_id: string
          id: string
          motivo: string | null
          usuario_id: string
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo_modificado: string
          created_at?: string
          evento_servicio_id: string
          id?: string
          motivo?: string | null
          usuario_id: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo_modificado?: string
          created_at?: string
          evento_servicio_id?: string
          id?: string
          motivo?: string | null
          usuario_id?: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evento_servicios_historial_evento_servicio_id_fkey"
            columns: ["evento_servicio_id"]
            isOneToOne: false
            referencedRelation: "evento_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_servicios_historial_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          cliente_ciudad: string | null
          cliente_contacto: string | null
          cliente_cuit_dni: string | null
          cliente_direccion: string | null
          cliente_direccion_factura: string | null
          cliente_nombre: string
          cliente_razon_social: string | null
          comision_organizador: number | null
          created_at: string
          deleted_at: string | null
          espacio: string | null
          fecha_carga: string
          fecha_confirmacion_presupuesto: string | null
          estado: Database["public"]["Enums"]["estado_evento"]
          fecha_contrato: string | null
          fecha_evento: string
          id: string
          nombre_evento: string | null
          observaciones: string | null
          organizador_externo: string | null
          organizador_email: string | null
          organizador_nombre: string | null
          organizador_telefono: string | null
          pax_adultos: number | null
          pax_bebes: number | null
          pax_jovenes: number | null
          pax_menores: number | null
          salon_id: string
          subtipo_evento: string | null
          tipo_evento: string | null
          tiene_organizador: boolean
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          cliente_ciudad?: string | null
          cliente_contacto?: string | null
          cliente_cuit_dni?: string | null
          cliente_direccion?: string | null
          cliente_direccion_factura?: string | null
          cliente_nombre: string
          cliente_razon_social?: string | null
          comision_organizador?: number | null
          created_at?: string
          deleted_at?: string | null
          espacio?: string | null
          fecha_carga?: string
          fecha_confirmacion_presupuesto?: string | null
          estado?: Database["public"]["Enums"]["estado_evento"]
          fecha_contrato?: string | null
          fecha_evento: string
          id?: string
          nombre_evento?: string | null
          observaciones?: string | null
          organizador_externo?: string | null
          organizador_email?: string | null
          organizador_nombre?: string | null
          organizador_telefono?: string | null
          pax_adultos?: number | null
          pax_bebes?: number | null
          pax_jovenes?: number | null
          pax_menores?: number | null
          salon_id: string
          subtipo_evento?: string | null
          tipo_evento?: string | null
          tiene_organizador?: boolean
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          cliente_ciudad?: string | null
          cliente_contacto?: string | null
          cliente_cuit_dni?: string | null
          cliente_direccion?: string | null
          cliente_direccion_factura?: string | null
          cliente_nombre?: string
          cliente_razon_social?: string | null
          comision_organizador?: number | null
          created_at?: string
          deleted_at?: string | null
          espacio?: string | null
          fecha_carga?: string
          fecha_confirmacion_presupuesto?: string | null
          estado?: Database["public"]["Enums"]["estado_evento"]
          fecha_contrato?: string | null
          fecha_evento?: string
          id?: string
          nombre_evento?: string | null
          observaciones?: string | null
          organizador_externo?: string | null
          organizador_email?: string | null
          organizador_nombre?: string | null
          organizador_telefono?: string | null
          pax_adultos?: number | null
          pax_bebes?: number | null
          pax_jovenes?: number | null
          pax_menores?: number | null
          salon_id?: string
          subtipo_evento?: string | null
          tipo_evento?: string | null
          tiene_organizador?: boolean
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      egresos: {
        Row: {
          catering_contrato_id: string | null
          categoria: string
          concepto: string
          created_at: string
          deleted_at: string | null
          evento_id: string | null
          evento_servicio_id: string | null
          fecha_egreso: string
          forma_pago: Database["public"]["Enums"]["forma_pago"] | null
          id: string
          importe_en_pesos: number
          importe_moneda_original: number
          moneda: Database["public"]["Enums"]["moneda"]
          notas: string | null
          proveedor: string | null
          registrado_por: string | null
          tipo_cambio: number | null
          updated_at: string
        }
        Insert: {
          catering_contrato_id?: string | null
          categoria: string
          concepto: string
          created_at?: string
          deleted_at?: string | null
          evento_id?: string | null
          evento_servicio_id?: string | null
          fecha_egreso: string
          forma_pago?: Database["public"]["Enums"]["forma_pago"] | null
          id?: string
          importe_en_pesos: number
          importe_moneda_original: number
          moneda?: Database["public"]["Enums"]["moneda"]
          notas?: string | null
          proveedor?: string | null
          registrado_por?: string | null
          tipo_cambio?: number | null
          updated_at?: string
        }
        Update: {
          catering_contrato_id?: string | null
          categoria?: string
          concepto?: string
          created_at?: string
          deleted_at?: string | null
          evento_id?: string | null
          evento_servicio_id?: string | null
          fecha_egreso?: string
          forma_pago?: Database["public"]["Enums"]["forma_pago"] | null
          id?: string
          importe_en_pesos?: number
          importe_moneda_original?: number
          moneda?: Database["public"]["Enums"]["moneda"]
          notas?: string | null
          proveedor?: string | null
          registrado_por?: string | null
          tipo_cambio?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "egresos_catering_contrato_id_fkey"
            columns: ["catering_contrato_id"]
            isOneToOne: false
            referencedRelation: "catering_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_anticipacion_reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_evento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_evento_servicio_id_fkey"
            columns: ["evento_servicio_id"]
            isOneToOne: false
            referencedRelation: "evento_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "egresos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          banco: string | null
          catering_contrato_id: string | null
          concepto: string | null
          created_at: string
          deleted_at: string | null
          es_garantia: boolean
          evento_id: string | null
          evento_servicio_id: string | null
          fecha_pago: string
          forma_pago: Database["public"]["Enums"]["forma_pago"]
          id: string
          importe_en_pesos: number | null
          importe_moneda_original: number
          moneda: Database["public"]["Enums"]["moneda"]
          notas: string | null
          numero_cheque: string | null
          registrado_por: string | null
          tipo_cambio: number | null
          updated_at: string
        }
        Insert: {
          banco?: string | null
          catering_contrato_id?: string | null
          concepto?: string | null
          created_at?: string
          deleted_at?: string | null
          es_garantia?: boolean
          evento_id?: string | null
          evento_servicio_id?: string | null
          fecha_pago: string
          forma_pago: Database["public"]["Enums"]["forma_pago"]
          id?: string
          importe_en_pesos?: number | null
          importe_moneda_original: number
          moneda?: Database["public"]["Enums"]["moneda"]
          notas?: string | null
          numero_cheque?: string | null
          registrado_por?: string | null
          tipo_cambio?: number | null
          updated_at?: string
        }
        Update: {
          banco?: string | null
          catering_contrato_id?: string | null
          concepto?: string | null
          created_at?: string
          deleted_at?: string | null
          es_garantia?: boolean
          evento_id?: string | null
          evento_servicio_id?: string | null
          fecha_pago?: string
          forma_pago?: Database["public"]["Enums"]["forma_pago"]
          id?: string
          importe_en_pesos?: number | null
          importe_moneda_original?: number
          moneda?: Database["public"]["Enums"]["moneda"]
          notas?: string | null
          numero_cheque?: string | null
          registrado_por?: string | null
          tipo_cambio?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_catering_contrato_id_fkey"
            columns: ["catering_contrato_id"]
            isOneToOne: false
            referencedRelation: "catering_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_anticipacion_reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_evento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_evento_servicio_id_fkey"
            columns: ["evento_servicio_id"]
            isOneToOne: false
            referencedRelation: "evento_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          descripcion: string | null
          es_sistema: boolean
          id: string
          legacy_rol: Database["public"]["Enums"]["rol_usuario"]
          nombre: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          es_sistema?: boolean
          id?: string
          legacy_rol?: Database["public"]["Enums"]["rol_usuario"]
          nombre: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          es_sistema?: boolean
          id?: string
          legacy_rol?: Database["public"]["Enums"]["rol_usuario"]
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          can_manage: boolean
          role_id: string
          screen: string
        }
        Insert: {
          can_manage?: boolean
          role_id: string
          screen: string
        }
        Update: {
          can_manage?: boolean
          role_id?: string
          screen?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      salones: {
        Row: {
          activo: boolean
          capacidad: number | null
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          direccion: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          capacidad?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          direccion?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          capacidad?: number | null
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          direccion?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      servicios_catalogo: {
        Row: {
          activo: boolean
          categoria: Database["public"]["Enums"]["categoria_servicio"]
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria: Database["public"]["Enums"]["categoria_servicio"]
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria?: Database["public"]["Enums"]["categoria_servicio"]
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      servicio_precios_mensuales: {
        Row: {
          created_at: string
          id: string
          importado_por: string | null
          iva_porcentaje: number
          moneda: Database["public"]["Enums"]["moneda"]
          periodo: string
          precio_base: number
          salon_id: string | null
          servicio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          importado_por?: string | null
          iva_porcentaje?: number
          moneda?: Database["public"]["Enums"]["moneda"]
          periodo: string
          precio_base: number
          salon_id?: string | null
          servicio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          importado_por?: string | null
          iva_porcentaje?: number
          moneda?: Database["public"]["Enums"]["moneda"]
          periodo?: string
          precio_base?: number
          salon_id?: string | null
          servicio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicio_precios_mensuales_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicio_precios_mensuales_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicio_precios_mensuales_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_salon: {
        Row: {
          created_at: string
          salon_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          salon_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          salon_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_salon_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_salon_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_roles: {
        Row: {
          created_at: string
          role_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          role_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          role_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_roles_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email: string
          full_name: string
          id: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_anticipacion_reserva: {
        Row: {
          cliente_nombre: string | null
          dias_anticipacion: number | null
          fecha_contrato: string | null
          fecha_evento: string | null
          id: string | null
          salon: string | null
        }
        Relationships: []
      }
      v_resumen_evento: {
        Row: {
          cliente_nombre: string | null
          estado: Database["public"]["Enums"]["estado_evento"] | null
          fecha_evento: string | null
          id: string | null
          saldo_catering: number | null
          saldo_servicios: number | null
          salon: string | null
          total_catering: number | null
          total_pagado_catering: number | null
          total_pagado_servicios: number | null
          total_servicios: number | null
          vendedor: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      audit_current_user_is_admin: { Args: never; Returns: boolean }
      audit_sanitize_jsonb: { Args: { p_value: Json }; Returns: Json }
      catering_buscar_eventos: {
        Args: { p_query: string; p_evento_id?: string | null }
        Returns: {
          id: string
          cliente_nombre: string | null
          fecha_evento: string | null
          salon_id: string
          salon_nombre: string
        }[]
      }
      catering_evento_existe: { Args: { p_evento_id: string }; Returns: boolean }
      admin_create_usuario_profile: {
        Args: {
          p_activo: boolean
          p_email: string
          p_full_name: string
          p_id: string
          p_rol: Database["public"]["Enums"]["rol_usuario"]
          p_salon_ids?: string[]
        }
        Returns: Database["public"]["Tables"]["usuarios"]["Row"]
      }
      admin_update_usuario: {
        Args: {
          p_activo: boolean
          p_email: string
          p_full_name: string
          p_id: string
          p_rol: Database["public"]["Enums"]["rol_usuario"]
          p_salon_ids?: string[]
        }
        Returns: Database["public"]["Tables"]["usuarios"]["Row"]
      }
      admin_assign_usuario_role: {
        Args: { p_role_id: string; p_usuario_id: string }
        Returns: undefined
      }
      admin_save_role: {
        Args: {
          p_descripcion: string
          p_manage_screens?: string[]
          p_nombre: string
          p_role_id: string | null
          p_screens: string[]
        }
        Returns: Database["public"]["Tables"]["roles"]["Row"]
      }
      current_user_is_active: { Args: never; Returns: boolean }
      current_user_is_active_admin: { Args: never; Returns: boolean }
      current_user_permissions: {
        Args: never
        Returns: {
          can_manage: boolean
          screen: string
        }[]
      }
      previsualizar_actualizacion_ipc: {
        Args: { p_periodo: string; p_variacion_porcentual: number }
        Returns: {
          cantidad_eventos: number
          cantidad_servicios: number
          monto_precio_base_anterior: number
          monto_precio_base_proyectado: number
          monto_total_con_iva_anterior: number
          monto_total_con_iva_proyectado: number
        }[]
      }
      registrar_y_aplicar_ipc: {
        Args: { p_periodo: string; p_variacion_porcentual: number }
        Returns: {
          cantidad_eventos: number
          cantidad_servicios: number
          ipc_indice_id: string
          monto_precio_base_actualizado: number
          monto_precio_base_anterior: number
          monto_total_con_iva_actualizado: number
          monto_total_con_iva_anterior: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      set_usuario_salon_assignments: {
        Args: { p_usuario_id: string; p_salon_ids?: string[] }
        Returns: undefined
      }
      usuario_tiene_catering_contrato: {
        Args: { p_catering_contrato_id: string }
        Returns: boolean
      }
      usuario_tiene_evento: { Args: { p_evento_id: string }; Returns: boolean }
      usuario_tiene_evento_servicio: {
        Args: { p_evento_servicio_id: string }
        Returns: boolean
      }
      usuario_tiene_salon: { Args: { p_salon_id: string }; Returns: boolean }
    }
    Enums: {
      accion_audit:
        | "INSERT"
        | "UPDATE"
        | "DELETE"
        | "SOFT_DELETE"
        | "RESTORE"
        | "ASSIGN"
        | "UNASSIGN"
      categoria_catering_item:
        | "alimentos"
        | "bebidas_alcoholicas"
        | "adicional_alimentos"
        | "adicional_bebidas"
        | "adicional_otros"
      categoria_servicio:
        | "salon"
        | "dj"
        | "ambientacion"
        | "catering"
        | "estacionamiento"
        | "fotografo"
        | "sadaic"
        | "sillas_tiffany"
        | "garantia"
        | "varios"
      estado_evento: "borrador" | "confirmado" | "realizado" | "cancelado"
      forma_pago:
        | "efectivo_pesos"
        | "efectivo_dolares"
        | "efectivo_euros"
        | "transferencia"
        | "cheque"
        | "retenciones"
      moneda: "ARS" | "USD" | "EUR"
      rol_usuario: "admin" | "vendedor" | "ejecutiva_catering"
      tipo_actualizacion: "ipc" | "porcentaje_fijo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      accion_audit: [
        "INSERT",
        "UPDATE",
        "DELETE",
        "SOFT_DELETE",
        "RESTORE",
        "ASSIGN",
        "UNASSIGN",
      ],
      categoria_catering_item: [
        "alimentos",
        "bebidas_alcoholicas",
        "adicional_alimentos",
        "adicional_bebidas",
        "adicional_otros",
      ],
      categoria_servicio: [
        "salon",
        "dj",
        "ambientacion",
        "catering",
        "estacionamiento",
        "fotografo",
        "sadaic",
        "sillas_tiffany",
        "garantia",
        "varios",
      ],
      estado_evento: ["borrador", "confirmado", "realizado", "cancelado"],
      forma_pago: [
        "efectivo_pesos",
        "efectivo_dolares",
        "efectivo_euros",
        "transferencia",
        "cheque",
        "retenciones",
      ],
      moneda: ["ARS", "USD", "EUR"],
      rol_usuario: ["admin", "vendedor", "ejecutiva_catering"],
      tipo_actualizacion: ["ipc", "porcentaje_fijo"],
    },
  },
} as const
