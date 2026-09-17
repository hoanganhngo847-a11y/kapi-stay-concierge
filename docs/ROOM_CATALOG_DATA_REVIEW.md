# Room Catalog Data Review

This document provides a systematic review of all room and property catalog data discovered in the codebase prior to production cloud ingestion.

---

## 1. Discovered Catalog Data Sources

### Source A: Hardcoded Demo Array (`app/rooms/page.tsx` — removed in Phase 3)
| Room ID | Name | Type Label | Price (VND/đêm) | Amenities Sample | Source File | Classification |
|---|---|---|---|---|---|---|
| `deluxe-terrace` | Phòng Deluxe Ban Công Hoa Nắng | Studio 1 Giường Đôi | 650.000 | Wifi, Điều hòa, Khóa số, Ban công | `app/rooms/page.tsx` | **Placeholder / Demo** |
| `cozy-nest` | Phòng Cozy Nest Ấm Cúng | Phòng Tiêu Chuẩn 1 Giường Lớn | 480.000 | Khóa thông minh, Nước nóng, Máy chiếu | `app/rooms/page.tsx` | **Placeholder / Demo** |
| `family-suite` | Phòng Family Suite Gia Đình | Căn Hộ 2 Phòng Ngủ | 1.150.000 | Bếp nấu, Tủ lạnh lớn, Máy giặt, Smart TV | `app/rooms/page.tsx` | **Placeholder / Demo** |

### Source B: Development Database Seed (`supabase/seed.sql`)
#### Properties (4 Records)
| Property ID | Property Name | Slug | Address | Maps URL | Classification |
|---|---|---|---|---|---|
| `11111111-...` | Kapi House — Biệt Thự Hoa Hồng | `kapi-house-hoa-hong` | 12 Đường Hoa Hồng, Phường 4, TP. Đà Lạt | `https://maps.google.com/?q=...` | **Local Seed / Demo** |
| `22222222-...` | Kapi House — Thung Lũng Mây | `kapi-house-thung-lung` | 45 Đặng Thái Thân, Phường 3, TP. Đà Lạt | `https://maps.google.com/?q=...` | **Local Seed / Demo** |
| `33333333-...` | Kapi House — Ven Hồ Tuyền Lâm | `kapi-house-ho-tuyen-lam` | Khu Du Lịch Hồ Tuyền Lâm, Phường 4, TP. Đà Lạt | `https://maps.google.com/?q=...` | **Local Seed / Demo** |
| `44444444-...` | Kapi House — Phố Cổ Trung Tâm | `kapi-house-pho-co` | 88 Phan Đình Phùng, Phường 2, TP. Đà Lạt | `https://maps.google.com/?q=...` | **Local Seed / Demo** |

#### Rooms (4 Records)
| Room UUID | Property | Room Name | Price (VND) | Capacity | Image Path | Classification |
|---|---|---|---|---|---|---|
| `a1111111-...` | Biệt Thự Hoa Hồng | Phòng Deluxe Ban Công Hoa Nắng | 650.000 | 2 | `/rooms/deluxe-terrace.jpg` | **Local Seed / Demo** |
| `b2222222-...` | Biệt Thự Hoa Hồng | Phòng Cozy Nest Ấm Cúng | 480.000 | 2 | `/rooms/cozy-nest.jpg` | **Local Seed / Demo** |
| `c3333333-...` | Thung Lũng Mây | Phòng Family Suite Gia Đình | 1.150.000 | 4 | `/rooms/family-suite.jpg` | **Local Seed / Demo** |
| `d4444444-...` | Thung Lũng Mây | Phòng Studio Mây Ngàn | 850.000 | 2 | `/rooms/studio-may-ngan.jpg` | **Local Seed / Demo** |

---

## 2. Asset & Image Analysis
- **Referenced Image Paths:** `/rooms/deluxe-terrace.jpg`, `/rooms/cozy-nest.jpg`, `/rooms/family-suite.jpg`, `/rooms/studio-may-ngan.jpg`.
- **Physical Files in Repository:** **None**. The `public/` directory contains only default framework SVG icons (`next.svg`, `vercel.svg`, etc.).
- **Runtime Handling:** The Phase 3 catalog and detail UI use a graceful fallback system: if an image path fails to load or is missing, a branded neutral Kapi House SVG/CSS placeholder is automatically rendered.
- **Completeness Warning:** No production photography has been uploaded to Supabase Storage or added to the repository.

---

## 3. Completeness & Discrepancies
- **App vs Seed Record Count:**
  - `app/rooms/page.tsx` originally presented 3 sample rooms.
  - `supabase/seed.sql` provided 4 development rooms across 2 of the 4 seeded properties.
  - Properties 3 (Ven Hồ Tuyền Lâm) and 4 (Phố Cổ Trung Tâm) currently have 0 associated room rows.
- **Production Truth Status:**
  - Supabase Cloud (`uwbvwuscazlywhsonooy`) currently contains **0 rows** in `properties` and **0 rows** in `rooms`.
  - The local database contains the 4 seed rooms for development and manual testing.
  - Neither source represents verified, production-signed catalog data.

---

## 4. Missing Information for Production Ingestion
1. **Real Room Photography:** High-resolution interior, bathroom, and exterior photos stored in a public Supabase Storage bucket or CDN.
2. **Room Specifications:** Room area ($m^2$), bed configurations (e.g., King, Queen, Twin), floor numbers.
3. **Exact Geolocation:** Verified Google Place IDs or precise lat/long coordinates for property branches in Da Lat.
4. **Finalized Pricing Matrix:** Standard vs weekend/holiday base pricing policies.

---

## 5. Recommendation for Cloud Import
1. **Do NOT upload development seed data to Cloud:** The 4 sample records in `supabase/seed.sql` use dummy UUIDs (`a1111111-...`) and reference non-existent local image files.
2. **Review Catalog with Stakeholders:** Gather approved room names, photos, capacity limits, and pricing before performing a production data migration.
3. **Dedicated Ingestion Script / Migration:** Once reviewed, apply a dedicated production seed or migration through administrative tooling rather than mixing local development fixtures into the cloud database.
