import { createClient } from "@/lib/supabase/server";

export type MenuCategory = "DRINK" | "SNACK" | "MAIN_FOOD";

export interface MenuProduct {
  id: string;
  name: string;
  slug: string;
  category: MenuCategory;
  description: string | null;
  price_vnd: number;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export async function getMenuProducts(category?: MenuCategory): Promise<{
  data: MenuProduct[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcRaw, error: rpcError } = await (supabase.rpc as any)("get_menu_products", {
      p_category: category || null,
    });

    if (rpcError) {
      console.error("[menu] getMenuProducts RPC error:", rpcError.message);
      // Fallback query if RPC has issue
      let query = supabase
        .from("menu_products")
        .select("id, name, slug, category, description, price_vnd, image_url, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (category) {
        query = query.eq("category", category);
      }

      const { data: directData, error: directError } = await query;
      if (directError) {
        return { data: [], error: "Không thể tải danh sách thực đơn." };
      }
      return { data: (directData as MenuProduct[]) ?? [], error: null };
    }

    const res = rpcRaw as { success: boolean; products?: MenuProduct[] } | null;
    return { data: res?.products ?? [], error: null };
  } catch (err) {
    console.error("[menu] getMenuProducts exception:", err);
    return { data: [], error: "Lỗi kết nối cơ sở dữ liệu." };
  }
}
