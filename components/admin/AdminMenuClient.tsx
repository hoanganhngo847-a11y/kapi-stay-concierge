"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Eye,
  EyeOff,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  UtensilsCrossed,
  X,
  Image as ImageIcon,
} from "lucide-react";
import type { AdminMenuProductItem } from "@/lib/data/admin";
import {
  adminCreateMenuProductAction,
  adminUpdateMenuProductAction,
  adminSetMenuProductActiveAction,
  adminUploadMenuMediaFileAction,
} from "@/app/admin/actions";
import { formatVND } from "@/lib/utils/format";

interface AdminMenuClientProps {
  initialProducts: AdminMenuProductItem[];
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function AdminMenuClient({ initialProducts }: AdminMenuClientProps) {
  const router = useRouter();

  const [products, setProducts] = React.useState<AdminMenuProductItem[]>(initialProducts);
  const [selectedCategory, setSelectedCategory] = React.useState<string>("ALL");
  const [searchTerm, setSearchTerm] = React.useState<string>("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<AdminMenuProductItem | null>(null);

  // Form State
  const [formName, setFormName] = React.useState("");
  const [formSlug, setFormSlug] = React.useState("");
  const [formCategory, setFormCategory] = React.useState<"DRINK" | "SNACK" | "MAIN_FOOD">("DRINK");
  const [formDescription, setFormDescription] = React.useState("");
  const [formPrice, setFormPrice] = React.useState<number>(20000);
  const [formImageUrl, setFormImageUrl] = React.useState("");
  const [formSortOrder, setFormSortOrder] = React.useState<number>(0);
  const [formIsActive, setFormIsActive] = React.useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isUploadingImage, setIsUploadingImage] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<{ text: string; isError?: boolean } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setFormName("");
    setFormSlug("");
    setFormCategory("DRINK");
    setFormDescription("");
    setFormPrice(20000);
    setFormImageUrl("");
    setFormSortOrder(products.length + 1);
    setFormIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (product: AdminMenuProductItem) => {
    setEditingProduct(product);
    setFormName(product.name);
    setFormSlug(product.slug);
    setFormCategory(product.category);
    setFormDescription(product.description || "");
    setFormPrice(product.price_vnd);
    setFormImageUrl(product.image_url || "");
    setFormSortOrder(product.sort_order);
    setFormIsActive(product.is_active);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Name change auto-generates slug if creating new product
  const handleNameChange = (val: string) => {
    setFormName(val);
    if (!editingProduct) {
      setFormSlug(slugify(val));
    }
  };

  // Upload image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setFormError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", formCategory);
    formData.append("product_id", editingProduct?.id || "new");

    const res = await adminUploadMenuMediaFileAction(formData);
    setIsUploadingImage(false);

    if (!res.success || !res.image_url) {
      setFormError(res.error || "Tải lên ảnh thất bại.");
    } else {
      setFormImageUrl(res.image_url);
    }
  };

  // Submit Form
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    const cleanSlug = formSlug.trim() || slugify(formName);

    if (editingProduct) {
      // Edit
      const res = await adminUpdateMenuProductAction(editingProduct.id, {
        name: formName,
        slug: cleanSlug,
        category: formCategory,
        description: formDescription,
        price_vnd: Number(formPrice),
        image_url: formImageUrl,
        sort_order: Number(formSortOrder),
        is_active: formIsActive,
      });

      setIsSubmitting(false);
      if (!res.success) {
        setFormError(res.error || "Cập nhật món thất bại.");
      } else {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === editingProduct.id
              ? {
                  ...p,
                  name: formName,
                  slug: cleanSlug,
                  category: formCategory,
                  description: formDescription,
                  price_vnd: Number(formPrice),
                  image_url: formImageUrl,
                  sort_order: Number(formSortOrder),
                  is_active: formIsActive,
                }
              : p
          )
        );
        setIsModalOpen(false);
        setActionMessage({ text: `Đã cập nhật món "${formName}" thành công.` });
        router.refresh();
      }
    } else {
      // Create
      const res = await adminCreateMenuProductAction({
        name: formName,
        slug: cleanSlug,
        category: formCategory,
        description: formDescription,
        price_vnd: Number(formPrice),
        image_url: formImageUrl,
        sort_order: Number(formSortOrder),
        is_active: formIsActive,
      });

      setIsSubmitting(false);
      if (!res.success || !res.id) {
        setFormError(res.error || "Thêm món mới thất bại.");
      } else {
        const newProduct: AdminMenuProductItem = {
          id: res.id,
          name: formName,
          slug: cleanSlug,
          category: formCategory,
          description: formDescription,
          price_vnd: Number(formPrice),
          image_url: formImageUrl,
          sort_order: Number(formSortOrder),
          is_active: formIsActive,
        };
        setProducts((prev) => [...prev, newProduct]);
        setIsModalOpen(false);
        setActionMessage({ text: `Đã thêm món "${formName}" vào thực đơn.` });
        router.refresh();
      }
    }
  };

  // Toggle active status (deactivate / reactivate)
  const handleToggleActive = async (product: AdminMenuProductItem) => {
    const newStatus = !product.is_active;
    setActionMessage(null);

    const res = await adminSetMenuProductActiveAction(product.id, newStatus);
    if (!res.success) {
      setActionMessage({ text: res.error || "Thay đổi trạng thái thất bại", isError: true });
    } else {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: newStatus } : p))
      );
      setActionMessage({
        text: `Đã ${newStatus ? "mở bán lại" : "ngừng bán"} món "${product.name}".`,
      });
      router.refresh();
    }
  };

  // Filtered products
  const filteredProducts = React.useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== "ALL" && p.category !== selectedCategory) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSlug = p.slug.toLowerCase().includes(q);
        if (!matchesName && !matchesSlug) return false;
      }
      return true;
    });
  }, [products, selectedCategory, searchTerm]);

  const categoryLabels: Record<string, string> = {
    DRINK: "Nước uống",
    SNACK: "Đồ ăn vặt",
    MAIN_FOOD: "Đồ ăn chính",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5E5E5] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#111111] tracking-tight">
            Quản Lý Thực Đơn (Menu)
          </h1>
          <p className="text-xs sm:text-sm text-[#707072] mt-1">
            Quản lý danh mục đồ ăn, nước uống, giá tiền và hình ảnh hiển thị trên trang web.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-[#111111] text-white text-xs font-medium hover:bg-[#262626] transition-colors flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Thêm món mới</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3 text-xs flex items-center gap-2 border ${
            actionMessage.isError
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          {actionMessage.isError ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-[#E5E5E5]">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {[
            { id: "ALL", label: "Tất cả", count: products.length },
            {
              id: "DRINK",
              label: "Nước uống",
              count: products.filter((p) => p.category === "DRINK").length,
            },
            {
              id: "SNACK",
              label: "Đồ ăn vặt",
              count: products.filter((p) => p.category === "SNACK").length,
            },
            {
              id: "MAIN_FOOD",
              label: "Đồ ăn chính",
              count: products.filter((p) => p.category === "MAIN_FOOD").length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border ${
                selectedCategory === tab.id
                  ? "bg-[#111111] text-white border-[#111111]"
                  : "bg-[#F9F9F9] text-[#707072] border-[#E5E5E5] hover:border-[#CCCCCC]"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex items-center sm:w-72">
          <Search className="w-4 h-4 text-[#707072] absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên món hoặc slug..."
            className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] text-[#111111] pl-9 pr-3 py-1.5 focus:outline-none focus:border-[#111111] placeholder:text-[#9E9EA0]"
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white border border-[#E5E5E5] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#707072] font-medium">
            <tr>
              <th className="py-3 px-4 w-14">Ảnh</th>
              <th className="py-3 px-4">Tên món & Slug</th>
              <th className="py-3 px-4">Danh mục</th>
              <th className="py-3 px-4">Giá bán</th>
              <th className="py-3 px-4">Thứ tự</th>
              <th className="py-3 px-4">Trạng thái</th>
              <th className="py-3 px-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E5]">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[#707072]">
                  Không tìm thấy món ăn nào phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-[#F9F9F9] transition-colors">
                  {/* Image */}
                  <td className="py-3 px-4">
                    <div className="w-10 h-10 bg-[#EFEFEF] border border-[#E5E5E5] overflow-hidden flex items-center justify-center">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <UtensilsCrossed className="w-4 h-4 text-[#CCCCCC]" />
                      )}
                    </div>
                  </td>

                  {/* Name & Slug */}
                  <td className="py-3 px-4">
                    <div className="font-medium text-[#111111]">{p.name}</div>
                    <div className="text-[11px] font-mono text-[#707072] mt-0.5">{p.slug}</div>
                  </td>

                  {/* Category */}
                  <td className="py-3 px-4 text-[#707072]">
                    <span className="px-2 py-0.5 bg-[#F0F0F0] border border-[#E5E5E5] text-[10px] font-medium text-[#111111]">
                      {categoryLabels[p.category] || p.category}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="py-3 px-4 font-semibold text-[#111111]">
                    {formatVND(p.price_vnd)}
                  </td>

                  {/* Sort Order */}
                  <td className="py-3 px-4 font-mono text-[#707072]">
                    #{p.sort_order}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-4">
                    {p.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-medium">
                        <Eye className="w-3 h-3" /> Đang bán
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-700 text-[10px] font-medium">
                        <EyeOff className="w-3 h-3" /> Ngừng bán
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(p)}
                      className="px-2.5 py-1 border border-[#E5E5E5] text-[#111111] hover:border-[#111111] transition-colors text-[11px]"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(p)}
                      className={`px-2.5 py-1 text-[11px] border transition-colors ${
                        p.is_active
                          ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                          : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      }`}
                    >
                      {p.is_active ? "Ngừng bán" : "Mở bán lại"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-none">
          <div className="bg-white border border-[#111111] w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="bg-[#FAFAFA] border-b border-[#E5E5E5] px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#111111]">
                {editingProduct ? "Chỉnh sửa món ăn / nước uống" : "Thêm món mới vào thực đơn"}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-[#707072] hover:text-[#111111]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitProduct} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Tên món */}
              <div>
                <label className="block text-xs font-medium text-[#111111] mb-1">
                  Tên món <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="VD: Coca-Cola lon, Mì xào bò"
                  className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-xs font-medium text-[#111111] mb-1">
                  Slug URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  placeholder="VD: cocacola-lon, mi-xao-bo"
                  className="w-full text-xs font-mono bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
                />
              </div>

              {/* Danh mục */}
              <div>
                <label className="block text-xs font-medium text-[#111111] mb-1">
                  Danh mục <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as "DRINK" | "SNACK" | "MAIN_FOOD")}
                  className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
                >
                  <option value="DRINK">Nước uống (DRINK)</option>
                  <option value="SNACK">Đồ ăn vặt (SNACK)</option>
                  <option value="MAIN_FOOD">Đồ ăn chính (MAIN_FOOD)</option>
                </select>
              </div>

              {/* Giá bán & Thứ tự */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#111111] mb-1">
                    Giá bán (VND) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={formPrice}
                    onChange={(e) => setFormPrice(parseInt(e.target.value, 10) || 0)}
                    className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
                  />
                  <span className="text-[10px] text-[#707072] mt-0.5 block font-mono">
                    {formatVND(formPrice)}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#111111] mb-1">
                    Thứ tự hiển thị
                  </label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(parseInt(e.target.value, 10) || 0)}
                    className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] px-3 py-2 text-[#111111] focus:outline-none focus:border-[#111111]"
                  />
                </div>
              </div>

              {/* Mô tả */}
              <div>
                <label className="block text-xs font-medium text-[#111111] mb-1">
                  Mô tả món ăn
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Mô tả hương vị, quy cách đóng gói..."
                  className="w-full text-xs bg-[#F9F9F9] border border-[#E5E5E5] p-2.5 text-[#111111] focus:outline-none focus:border-[#111111]"
                />
              </div>

              {/* Ảnh món ăn */}
              <div>
                <label className="block text-xs font-medium text-[#111111] mb-1">
                  Ảnh sản phẩm
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-[#F5F5F5] border border-[#E5E5E5] overflow-hidden flex items-center justify-center shrink-0">
                    {formImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={formImageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-[#CCCCCC]" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isUploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-[#F5F5F5] border border-[#CCCCCC] text-[#111111] text-xs font-medium hover:bg-[#E5E5E5] transition-colors flex items-center gap-1.5"
                    >
                      {isUploadingImage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>Tải ảnh từ máy tính</span>
                    </button>
                    <input
                      type="text"
                      value={formImageUrl}
                      onChange={(e) => setFormImageUrl(e.target.value)}
                      placeholder="Hoặc nhập URL ảnh trực tiếp..."
                      className="w-full text-[11px] bg-[#F9F9F9] border border-[#E5E5E5] px-2.5 py-1 text-[#111111] focus:outline-none focus:border-[#111111]"
                    />
                  </div>
                </div>
              </div>

              {/* Trạng thái đang bán */}
              <div className="pt-2 border-t border-[#F0F0F0]">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 accent-[#111111]"
                  />
                  <span className="text-xs font-medium text-[#111111]">
                    Đang bán (Hiển thị cho khách đặt hàng)
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-[#E5E5E5] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-[#E5E5E5] text-xs font-medium text-[#707072] hover:text-[#111111] transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#111111] text-white text-xs font-medium hover:bg-[#262626] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingProduct ? "Lưu thay đổi" : "Tạo món mới"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
