-- ============================================================================
-- Migration: 20260929153000_kapi_menu_ordering.sql
-- Description:
--   1. Comprehensive Server-backed Menu Catalog (public.menu_products)
--      - Strictly 3 categories: DRINK, SNACK, MAIN_FOOD
--      - Full seed of 169 products across drinks, snacks, and main foods
--   2. Schema extensions on public.checkout_sessions & public.bookings:
--      - menu_amount_vnd bigint not null default 0
--      - Constraints update: final payable/paid amount = (gross - discount) + menu_amount_vnd
--   3. Menu Addons & Rewards persistence:
--      - public.checkout_menu_items (PURCHASE or REWARD)
--      - public.booking_menu_items
--   4. Fix & tighten streak progression in claim_daily_reward() & get_my_rewards_summary()
--      - current_streak is strictly >= 1 if checked in today
--      - Broken streak (gap >= 1 missed day): displays 0 until checked in again
--      - When user checks in after a break: resets streak to 1 and starts new cycle
--   5. Total price rule & non-discounted menu addons:
--      - Voucher discount applies strictly to room gross
--      - final_payable = (room_gross - room_discount) + menu_amount_vnd
--      - Updated reserve_checkout_voucher_atomic, release_checkout_voucher_atomic,
--        reserve_checkout_reward_entitlement_atomic, and release_checkout_reward_entitlement_atomic
--   6. Operations Visibility:
--      - get_staff_dashboard_data returns itemized food/drinks (Paid & Reward)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: public.menu_products (Server-backed menu catalog)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('DRINK', 'SNACK', 'MAIN_FOOD')),
  description TEXT,
  price_vnd INT NOT NULL CHECK (price_vnd >= 0),
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_menu_products_category ON public.menu_products (category, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_menu_products_slug ON public.menu_products (slug);

ALTER TABLE public.menu_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_products FROM public, anon, authenticated;
GRANT SELECT ON public.menu_products TO authenticated, anon;
GRANT ALL ON public.menu_products TO service_role;

DROP POLICY IF EXISTS "Public can view active menu products" ON public.menu_products;
CREATE POLICY "Public can view active menu products"
  ON public.menu_products
  FOR SELECT
  USING (is_active = true);

-- Seed Menu Products
INSERT INTO public.menu_products (name, slug, category, description, price_vnd, is_active, sort_order)
VALUES
  ('Nước suối 500ml', 'nuoc-suoi-500ml', 'DRINK', 'Nước khoáng tinh khiết đóng chai 500ml', 10000, true, 1),
  ('Nước suối premium 500ml', 'nuoc-suoi-premium-500ml', 'DRINK', 'Nước khoáng thiên nhiên cao cấp 500ml', 15000, true, 2),
  ('Coca-Cola lon', 'cocacola-lon', 'DRINK', 'Nước ngọt có gas vị truyền thống lon 320ml', 18000, true, 3),
  ('Coca-Cola Zero lon', 'cocacola-zero-lon', 'DRINK', 'Nước ngọt có gas không đường lon 320ml', 18000, true, 4),
  ('Pepsi lon', 'pepsi-lon', 'DRINK', 'Nước ngọt có gas vị truyền thống lon 320ml', 18000, true, 5),
  ('Pepsi Không Calo', 'pepsi-khong-calo', 'DRINK', 'Nước ngọt có gas không calo lon 320ml', 18000, true, 6),
  ('7Up lon', '7up-lon', 'DRINK', 'Nước ngọt có gas hương chanh lon 320ml', 18000, true, 7),
  ('Sprite lon', 'sprite-lon', 'DRINK', 'Nước ngọt có gas hương chanh sảng khoái 320ml', 18000, true, 8),
  ('Fanta cam', 'fanta-cam', 'DRINK', 'Nước ngọt có gas hương cam tươi mát 320ml', 18000, true, 9),
  ('Mirinda cam', 'mirinda-cam', 'DRINK', 'Nước ngọt có gas hương cam đậm đà 320ml', 18000, true, 10),
  ('Sting dâu', 'sting-dau', 'DRINK', 'Nước tăng lực hương dâu chai 330ml', 20000, true, 11),
  ('Sting vàng', 'sting-vang', 'DRINK', 'Nước tăng lực hương nhân sâm lon 320ml', 20000, true, 12),
  ('Red Bull', 'red-bull', 'DRINK', 'Nước tăng lực Red Bull nắp vàng lon 250ml', 22000, true, 13),
  ('Monster Energy', 'monster-energy', 'DRINK', 'Nước tăng lực nhập khẩu lon 355ml', 35000, true, 14),
  ('Warrior Energy', 'warrior-energy', 'DRINK', 'Nước tăng lực hương dâu lon 325ml', 20000, true, 15),
  ('Trà xanh Không Độ', 'tra-xanh-khong-do', 'DRINK', 'Trà xanh đóng chai giải nhiệt thanh mát 455ml', 18000, true, 16),
  ('C2 trà chanh', 'c2-tra-chanh', 'DRINK', 'Trà xanh hương chanh C2 chai 360ml', 18000, true, 17),
  ('Tea+ Ô Long', 'tea-o-long', 'DRINK', 'Trà Ô Long Tea+ vị đậm đà không đường chai 450ml', 20000, true, 18),
  ('Trà đào chai', 'tra-dao-chai', 'DRINK', 'Trà đào thanh ngọt tươi mát chai 450ml', 25000, true, 19),
  ('Trà chanh', 'tra-chanh', 'DRINK', 'Trà chanh truyền thống chua ngọt pha tươi', 22000, true, 20),
  ('Trà tắc', 'tra-tac', 'DRINK', 'Trà tắc giải nhiệt vị đậm đà pha tươi', 22000, true, 21),
  ('Trà vải', 'tra-vai', 'DRINK', 'Trà vải ngọt thanh thơm ngát', 25000, true, 22),
  ('Trà dâu', 'tra-dau', 'DRINK', 'Trà dâu tươi chua ngọt sảng khoái', 25000, true, 23),
  ('Soda chanh', 'soda-chanh', 'DRINK', 'Soda chanh đá sảng khoái', 25000, true, 24),
  ('Soda việt quất', 'soda-viet-quat', 'DRINK', 'Soda việt quất thơm mát có gas', 28000, true, 25),
  ('Cà phê đen lon', 'ca-phe-den-lon', 'DRINK', 'Cà phê đen đậm vị lon 180ml', 22000, true, 26),
  ('Cà phê sữa lon', 'ca-phe-sua-lon', 'DRINK', 'Cà phê sữa thơm béo lon 180ml', 24000, true, 27),
  ('Cà phê sữa đá', 'ca-phe-sua-da', 'DRINK', 'Cà phê sữa đá pha phin truyền thống', 25000, true, 28),
  ('Cà phê đen đá', 'ca-phe-den-da', 'DRINK', 'Cà phê đen đá pha phin nguyên chất', 22000, true, 29),
  ('Bạc xỉu', 'bac-xiu', 'DRINK', 'Bạc xỉu ba tầng sữa thơm béo đậm vị cà phê', 28000, true, 30),
  ('Sữa tươi không đường', 'sua-tuoi-khong-duong', 'DRINK', 'Sữa tươi tiệt trùng không đường 180ml', 20000, true, 31),
  ('Sữa tươi có đường', 'sua-tuoi-co-duong', 'DRINK', 'Sữa tươi tiệt trùng có đường 180ml', 20000, true, 32),
  ('Sữa socola', 'sua-socola', 'DRINK', 'Sữa socola thơm ngậy 180ml', 22000, true, 33),
  ('Sữa dâu', 'sua-dau', 'DRINK', 'Sữa hương dâu ngọt ngào 180ml', 22000, true, 34),
  ('Nước cam ép', 'nuoc-cam-ep', 'DRINK', 'Nước cam tươi vắt nguyên chất', 28000, true, 35),
  ('Nước chanh dây', 'nuoc-chanh-day', 'DRINK', 'Nước chanh dây chua ngọt tươi mát', 28000, true, 36),
  ('Nước ép dưa hấu', 'nuoc-ep-dua-hau', 'DRINK', 'Nước ép dưa hấu tươi mát thanh lọc', 30000, true, 37),
  ('Nước ép ổi', 'nuoc-ep-oi', 'DRINK', 'Nước ép ổi hồng giàu vitamin C', 30000, true, 38),
  ('Nước ép táo', 'nuoc-ep-tao', 'DRINK', 'Nước ép táo nguyên chất giòn ngọt', 32000, true, 39),
  ('Nước dừa', 'nuoc-dua', 'DRINK', 'Nước dừa tươi nguyên trái', 30000, true, 40),
  ('Nước nha đam', 'nuoc-nha-dam', 'DRINK', 'Nước nha đam hạt giòn thanh nhiệt', 25000, true, 41),
  ('Khoai tây chiên vị nguyên bản', 'khoai-tay-chien-vi-nguyen-ban', 'SNACK', 'Snack khoai tây giòn rụm vị muối biển', 18000, true, 42),
  ('Khoai tây chiên BBQ', 'khoai-tay-chien-bbq', 'SNACK', 'Snack khoai tây vị sườn nướng BBQ đậm đà', 18000, true, 43),
  ('Khoai tây chiên rong biển', 'khoai-tay-chien-rong-bien', 'SNACK', 'Snack khoai tây vị tảo biển thơm giòn', 20000, true, 44),
  ('Khoai tây chiên phô mai', 'khoai-tay-chien-pho-mai', 'SNACK', 'Snack khoai tây lắc bột phô mai béo ngậy', 20000, true, 45),
  ('Snack tôm cay', 'snack-tom-cay', 'SNACK', 'Bánh snack tôm giòn cay cay hấp dẫn', 16000, true, 46),
  ('Snack bắp ngọt', 'snack-bap-ngot', 'SNACK', 'Snack bắp ngọt bùi thơm lừng', 15000, true, 47),
  ('Snack mực cay', 'snack-muc-cay', 'SNACK', 'Snack mực nướng sa tế đậm vị', 18000, true, 48),
  ('Bắp rang bơ ngọt', 'bap-rang-bo-ngot', 'SNACK', 'Bắp rang bơ thơm phức ngọt dịu', 25000, true, 49),
  ('Bắp rang caramel', 'bap-rang-caramel', 'SNACK', 'Bắp rang phủ sốt caramel giòn tan', 28000, true, 50),
  ('Bắp rang phô mai', 'bap-rang-pho-mai', 'SNACK', 'Bắp rang phủ bột phô mai mặn mà', 28000, true, 51),
  ('Đậu phộng da cá', 'dau-phong-da-ca', 'SNACK', 'Đậu phộng bọc bột giòn tan vị nước cốt dừa', 18000, true, 52),
  ('Đậu phộng tỏi ớt', 'dau-phong-toi-ot', 'SNACK', 'Đậu phộng rang tỏi ớt cay mặn giòn rụm', 18000, true, 53),
  ('Hướng dương rang', 'huong-duong-rang', 'SNACK', 'Hạt hướng dương rang vị dừa tự nhiên', 15000, true, 54),
  ('Hạt điều rang muối', 'hat-dieu-rang-muoi', 'SNACK', 'Hạt điều nguyên hạt rang muối bùi béo', 32000, true, 55),
  ('Hạt dẻ cười', 'hat-de-cuoi', 'SNACK', 'Hạt dẻ cười rang muối hảo hạng', 39000, true, 56),
  ('Rong biển giòn', 'rong-bien-gion', 'SNACK', 'Rong biển sấy giòn tẩm gia vị ăn liền', 18000, true, 57),
  ('Rong biển kẹp hạt', 'rong-bien-kep-hat', 'SNACK', 'Thanh rong biển kẹp hạt dinh dưỡng ngũ cốc', 28000, true, 58),
  ('Bánh que socola', 'banh-que-socola', 'SNACK', 'Bánh quy que nhúng socola ngọt ngào', 16000, true, 59),
  ('Bánh que matcha', 'banh-que-matcha', 'SNACK', 'Bánh quy que nhúng trà xanh matcha Nhật Bản', 18000, true, 60),
  ('Bánh quy bơ', 'banh-quy-bo', 'SNACK', 'Bánh quy bơ thơm béo vàng ươm', 22000, true, 61),
  ('Bánh quy socola', 'banh-quy-socola', 'SNACK', 'Bánh quy kẹp kem socola hảo hạng', 22000, true, 62),
  ('Bánh gấu nhân socola', 'banh-gau-nhan-socola', 'SNACK', 'Bánh gấu giòn tan nhân kem socola', 18000, true, 63),
  ('Bánh gấu nhân dâu', 'banh-gau-nhan-dau', 'SNACK', 'Bánh gấu giòn tan nhân kem dâu thơm lừng', 18000, true, 64),
  ('Socola thanh', 'socola-thanh', 'SNACK', 'Thanh socola sữa nguyên chất thơm ngon', 25000, true, 65),
  ('Socola hạnh nhân', 'socola-hanh-nhan', 'SNACK', 'Socola sữa bọc hạt hạnh nhân giòn bùi', 32000, true, 66),
  ('Kẹo dẻo trái cây', 'keo-deo-trai-cay', 'SNACK', 'Kẹo dẻo vị trái cây thơm mềm chua ngọt', 20000, true, 67),
  ('Kẹo bạc hà', 'keo-bac-ha', 'SNACK', 'Kẹo ngậm bạc hà the mát sảng khoái', 15000, true, 68),
  ('Thạch trái cây', 'thach-trai-cay', 'SNACK', 'Thạch trái cây mát lạnh chua ngọt', 15000, true, 69),
  ('Pudding trứng', 'pudding-trung', 'SNACK', 'Pudding trứng mềm mịn núng nính ngọt ngào', 20000, true, 70),
  ('Pudding socola', 'pudding-socola', 'SNACK', 'Pudding socola đậm vị mềm tan', 22000, true, 71),
  ('Xúc xích tiệt trùng', 'xuc-xich-tiet-trung', 'SNACK', 'Cây xúc xích heo tiệt trùng ăn liền', 18000, true, 72),
  ('Xúc xích phô mai', 'xuc-xich-pho-mai', 'SNACK', 'Xúc xích nhân phô mai béo ngậy tan chảy', 22000, true, 73),
  ('Khô gà lá chanh', 'kho-ga-la-chanh', 'SNACK', 'Khô gà xé cay giòn thơm lừng mùi lá chanh', 39000, true, 74),
  ('Khô bò sợi', 'kho-bo-soi', 'SNACK', 'Khô bò sợi xé cay nồng thơm gia vị truyền thống', 49000, true, 75),
  ('Khô heo cháy tỏi', 'kho-heo-chay-toi', 'SNACK', 'Khô heo xé sợi rang tỏi thơm giòn hấp dẫn', 45000, true, 76),
  ('Mực cán tẩm vị', 'muc-can-tam-vi', 'SNACK', 'Mực khô cán mỏng tẩm vị sa tế cay ngọt', 49000, true, 77),
  ('Bánh tráng cuộn phô mai', 'banh-trang-cuon-pho-mai', 'SNACK', 'Bánh tráng cuộn sốt bơ và bột phô mai thơm ngậy', 29000, true, 78),
  ('Bánh tráng trộn', 'banh-trang-tron', 'SNACK', 'Bánh tráng trộn khô bò, trứng cút, xoài và sốt chua ngọt', 35000, true, 79),
  ('Bánh tráng sa tế', 'banh-trang-sa-te', 'SNACK', 'Bánh tráng ớt sa tế cay nồng thơm muối tôm', 25000, true, 80),
  ('Bánh tráng nướng', 'banh-trang-nuong', 'SNACK', 'Bánh tráng nướng Đà Lạt giòn rụm đầy đủ topping', 35000, true, 81),
  ('Nem chua mini', 'nem-chua-mini', 'SNACK', 'Đĩa nem chua rán giòn rụm chấm tương ớt', 24000, true, 82),
  ('Cá viên chiên', 'ca-vien-chien', 'SNACK', 'Đĩa cá viên chiên vàng giòn ăn kèm tương đen và ớt', 35000, true, 83),
  ('Bò viên chiên', 'bo-vien-chien', 'SNACK', 'Đĩa bò viên chiên đậm đà giòn sần sật', 38000, true, 84),
  ('Hồ lô chiên', 'ho-lo-chien', 'SNACK', 'Hồ lô nướng chiên vàng thơm mùi thịt', 35000, true, 85),
  ('Xúc xích chiên', 'xuc-xich-chien', 'SNACK', 'Xúc xích nướng chiên nóng hổi thơm ngon', 32000, true, 86),
  ('Phô mai que', 'pho-mai-que', 'SNACK', 'Phô mai que kéo sợi béo ngậy vỏ xù giòn', 38000, true, 87),
  ('Khoai tây chiên', 'khoai-tay-chien', 'SNACK', 'Khoai tây chiên vàng giòn rụm chấm sốt mayonnaise', 35000, true, 88),
  ('Khoai lang kén', 'khoai-lang-ken', 'SNACK', 'Khoai lang kén thơm bùi vỏ giòn ngọt dịu', 35000, true, 89),
  ('Takoyaki', 'takoyaki', 'SNACK', 'Bánh bạch tuộc nướng Nhật Bản sốt cá ngừ bào', 45000, true, 90),
  ('Há cảo chiên', 'ha-cao-chien', 'SNACK', 'Đĩa há cảo chiên giòn rụm nhân tôm thịt', 42000, true, 91),
  ('Gà viên chiên', 'ga-vien-chien', 'SNACK', 'Gà viên không xương lắc gia vị giòn cay', 39000, true, 92),
  ('Chả cá viên', 'cha-ca-vien', 'SNACK', 'Chả cá viên chiên giòn thơm nức mũi', 35000, true, 93),
  ('Mochi đậu đỏ', 'mochi-dau-do', 'SNACK', 'Bánh mochi dẻo mềm nhân đậu đỏ ngọt dịu', 26000, true, 94),
  ('Mochi matcha', 'mochi-matcha', 'SNACK', 'Bánh mochi dẻo vị trà xanh matcha thơm mát', 28000, true, 95),
  ('Bánh flan', 'banh-flan', 'SNACK', 'Bánh flan caramel mềm mịn béo ngậy vị sữa trứng', 18000, true, 96),
  ('Sữa chua', 'sua-chua', 'SNACK', 'Hũ sữa chua lên men tự nhiên bổ dưỡng', 15000, true, 97),
  ('Sữa chua nha đam', 'sua-chua-nha-dam', 'SNACK', 'Sữa chua thanh mát có thạch nha đam giòn', 18000, true, 98),
  ('Rau câu dừa', 'rau-cau-dua', 'SNACK', 'Rau câu nước cốt dừa thanh ngọt mát lạnh', 18000, true, 99),
  ('Kem que', 'kem-que', 'SNACK', 'Kem que giải nhiệt thơm mát nhiều vị', 15000, true, 100),
  ('Kem hộp mini', 'kem-hop-mini', 'SNACK', 'Kem hộp mini cao cấp béo ngậy thơm ngon', 28000, true, 101),
  ('Trái cây cắt ly', 'trai-cay-cat-ly', 'SNACK', 'Ly trái cây tươi bốn mùa cắt sẵn kèm muối ớt', 35000, true, 102),
  ('Cơm gà nướng', 'com-ga-nuong', 'MAIN_FOOD', 'Cơm dẻo ăn kèm đùi gà ướp sốt nướng than thơm lừng', 55000, true, 103),
  ('Cơm gà xối mỡ', 'com-ga-xoi-mo', 'MAIN_FOOD', 'Cơm chiên vàng ăn cùng gà da giòn rụm sốt chua ngọt', 55000, true, 104),
  ('Cơm gà sốt teriyaki', 'com-ga-sot-teriyaki', 'MAIN_FOOD', 'Cơm nóng ăn kèm gà xào sốt teriyaki Nhật Bản thơm đậm đà', 59000, true, 105),
  ('Cơm sườn nướng', 'com-suon-nuong', 'MAIN_FOOD', 'Cơm tấm sườn cốt lết nướng mật ong mềm thơm', 59000, true, 106),
  ('Cơm sườn bì chả', 'com-suon-bi-cha', 'MAIN_FOOD', 'Cơm tấm đặc biệt sườn nướng, bì thớ và chả trứng hấp', 65000, true, 107),
  ('Cơm bò lúc lắc', 'com-bo-luc-lac', 'MAIN_FOOD', 'Cơm chiên bơ tỏi ăn cùng thịt bò lúc lắc xào ớt chuông hành tây', 69000, true, 108),
  ('Cơm bò xào hành', 'com-bo-xao-hanh', 'MAIN_FOOD', 'Cơm dẻo thịt bò xào cần tỏi hành tây đậm vị', 65000, true, 109),
  ('Cơm rang trứng', 'com-rang-trung', 'MAIN_FOOD', 'Cơm chiên trứng hành tơi xốp thơm ngon thanh đạm', 45000, true, 110),
  ('Cơm rang gà xé', 'com-rang-ga-xe', 'MAIN_FOOD', 'Cơm chiên hạt vàng ăn cùng thịt gà luộc xé sợi đậm đà', 52000, true, 111),
  ('Cơm rang bò', 'com-rang-bo', 'MAIN_FOOD', 'Cơm chiên dưa bò giòn sần sật thơm nức mũi', 59000, true, 112),
  ('Cơm rang hải sản', 'com-rang-hai-san', 'MAIN_FOOD', 'Cơm chiên tôm mực giòn ngọt ăn kèm rau củ', 59000, true, 113),
  ('Cơm chiên dương châu', 'com-chien-duong-chau', 'MAIN_FOOD', 'Cơm chiên ngũ sắc lạp xưởng, tôm, đậu hà lan và trứng', 55000, true, 114),
  ('Cơm chiên kim chi', 'com-chien-kim-chi', 'MAIN_FOOD', 'Cơm chiên kim chi chua cay kiểu Hàn Quốc trứng ốp la', 55000, true, 115),
  ('Cơm cá kho', 'com-ca-kho', 'MAIN_FOOD', 'Cơm trắng ăn kèm cá kho tộ tiêu ớt đậm đà đưa cơm', 55000, true, 116),
  ('Cơm thịt kho trứng', 'com-thit-kho-trung', 'MAIN_FOOD', 'Cơm trắng thịt kho tàu nước dừa và trứng cút mềm béo', 55000, true, 117),
  ('Cơm thịt xào chua ngọt', 'com-thit-xao-chua-ngot', 'MAIN_FOOD', 'Cơm nóng ăn cùng thịt heo xào sốt cà chua dứa đậm đà', 59000, true, 118),
  ('Cơm gà cà ri', 'com-ga-ca-ri', 'MAIN_FOOD', 'Cơm trắng sốt gà cà ri khoai tây béo thơm nước cốt dừa', 59000, true, 119),
  ('Cơm bò sốt tiêu đen', 'com-bo-sot-tieu-den', 'MAIN_FOOD', 'Cơm thịt bò mềm thơm sốt tiêu đen cay nồng', 69000, true, 120),
  ('Phở bò tái', 'pho-bo-tai', 'MAIN_FOOD', 'Bánh phở mềm nước dùng hầm xương ngọt thanh, thịt bò tái tươi', 55000, true, 121),
  ('Phở bò chín', 'pho-bo-chin', 'MAIN_FOOD', 'Phở bò nạm gầu chín mềm đậm đà phong vị Hà Nội', 55000, true, 122),
  ('Phở bò tái chín', 'pho-bo-tai-chin', 'MAIN_FOOD', 'Bát phở kết hợp bò tái mềm ngọt và bò chín thơm ngậy', 59000, true, 123),
  ('Phở gà', 'pho-ga', 'MAIN_FOOD', 'Phở gà ta thịt thơm dai lá chanh và nước dùng trong thanh', 52000, true, 124),
  ('Phở xào bò', 'pho-xao-bo', 'MAIN_FOOD', 'Bánh phở áp chảo giòn mềm xào thịt bò và cải xanh', 59000, true, 125),
  ('Bún bò Huế', 'bun-bo-hue', 'MAIN_FOOD', 'Bún sợi to nước lèo cay nồng mùi sả mắm ruốc, bò nạm và chả cua', 59000, true, 126),
  ('Bún chả Hà Nội', 'bun-cha-ha-noi', 'MAIN_FOOD', 'Bún chả nướng than hoa thơm lừng chấm nước mắm đu đủ chua ngọt', 58000, true, 127),
  ('Bún trộn bò', 'bun-tron-bo', 'MAIN_FOOD', 'Bún tươi trộn thịt bò xào, lạc rang, hành phi và rau thơm', 55000, true, 128),
  ('Bún trộn gà', 'bun-tron-ga', 'MAIN_FOOD', 'Bún trộn thịt gà xé, rau thơm và nước sốt chua cay', 52000, true, 129),
  ('Bún thịt nướng', 'bun-thit-nuong', 'MAIN_FOOD', 'Bún thịt nướng sả mè ăn cùng chả giò và nước mắm ớt', 55000, true, 130),
  ('Bún nem nướng', 'bun-nem-nuong', 'MAIN_FOOD', 'Bún nem nướng Nha Trang thơm lừng ăn kèm sốt tương đậu', 55000, true, 131),
  ('Bún đậu mắm tôm', 'bun-dau-mam-tom', 'MAIN_FOOD', 'Mẹt bún đậu hũ rán giòn, thịt bắp luộc, chả cốm chấm mắm tôm', 65000, true, 132),
  ('Mì xào bò', 'mi-xao-bo', 'MAIN_FOOD', 'Mì tôm xào thịt bò xắt lát mỏng, rau cải giòn rụm', 55000, true, 133),
  ('Mì xào gà', 'mi-xao-ga', 'MAIN_FOOD', 'Mì xào thịt gà phi-lê giòn ngọt cùng rau củ', 52000, true, 134),
  ('Mì xào hải sản', 'mi-xao-hai-san', 'MAIN_FOOD', 'Mì xào tôm tươi, mực giòn và cải ngọt thơm ngon', 62000, true, 135),
  ('Mì trộn bò', 'mi-tron-bo', 'MAIN_FOOD', 'Mì trộn sốt sa tế đặc biệt ăn cùng thịt bò và trứng lòng đào', 55000, true, 136),
  ('Mì trộn gà', 'mi-tron-ga', 'MAIN_FOOD', 'Mì trộn thịt gà chiên mắm thơm lừng nước tương ớt', 52000, true, 137),
  ('Mì cay bò', 'mi-cay-bo', 'MAIN_FOOD', 'Tô mì cay Hàn Quốc 7 cấp độ thịt bò tươi và nấm kim châm', 59000, true, 138),
  ('Mì cay hải sản', 'mi-cay-hai-san', 'MAIN_FOOD', 'Tô mì cay hải sản tôm mực chua cay xuýt xoa', 65000, true, 139),
  ('Mì Ý bò bằm', 'mi-y-bo-bam', 'MAIN_FOOD', 'Spaghetti sốt cà chua thịt bò bằm đậm đà phô mai Parmesan', 65000, true, 140),
  ('Mì Ý sốt kem', 'mi-y-sot-kem', 'MAIN_FOOD', 'Spaghetti Carbonara sốt kem tươi béo ngậy thịt xông khói', 65000, true, 141),
  ('Nui xào bò', 'nui-xao-bo', 'MAIN_FOOD', 'Nui xào thịt bò mềm ngọt sốt cà chua tươi mát', 52000, true, 142),
  ('Nui xào gà', 'nui-xao-ga', 'MAIN_FOOD', 'Nui xào thịt gà và rau củ thơm ngon thanh đạm', 49000, true, 143),
  ('Miến gà', 'mien-ga', 'MAIN_FOOD', 'Miến dong nấu nước dùng gà ta ngọt thanh, nấm hương mộc nhĩ', 49000, true, 144),
  ('Miến bò', 'mien-bo', 'MAIN_FOOD', 'Miến dong nấu thịt bò tươi mềm thơm mùi hành hoa', 55000, true, 145),
  ('Miến xào cua', 'mien-xao-cua', 'MAIN_FOOD', 'Miến xào thịt cua xé sợi thơm ngọt bùi béo', 65000, true, 146),
  ('Cháo gà', 'chao-ga', 'MAIN_FOOD', 'Tô cháo gà nóng hổi thơm nức tiêu lá tía tô hành hoa', 42000, true, 147),
  ('Cháo sườn', 'chao-suon', 'MAIN_FOOD', 'Cháo sườn sụn ninh nhừ mịn màng ăn kèm quẩy giòn', 45000, true, 148),
  ('Cháo bò', 'chao-bo', 'MAIN_FOOD', 'Cháo thịt bò bằm thơm cay ấm bụng', 49000, true, 149),
  ('Cháo thịt bằm', 'chao-thit-bam', 'MAIN_FOOD', 'Cháo thịt heo bằm nhuyễn hành hoa thanh nhẹ', 39000, true, 150),
  ('Xôi gà', 'xoi-ga', 'MAIN_FOOD', 'Gói xôi nếp dẻo thơm ăn cùng thịt gà xé và hành phi giòn', 39000, true, 151),
  ('Xôi mặn thập cẩm', 'xoi-man-thap-cam', 'MAIN_FOOD', 'Xôi nếp dẻo ăn cùng lạp xưởng, chà bông, pate và mỡ hành', 42000, true, 152),
  ('Xôi thịt kho', 'xoi-thit-kho', 'MAIN_FOOD', 'Xôi nếp dẻo chan nước thịt kho tàu và trứng cút', 42000, true, 153),
  ('Bánh mì bò', 'banh-mi-bo', 'MAIN_FOOD', 'Bánh mì giòn rụm kẹp thịt bò xào sốt tiêu đen', 35000, true, 154),
  ('Bánh mì gà', 'banh-mi-ga', 'MAIN_FOOD', 'Bánh mì kẹp gà xé sốt bơ trứng béo ngậy', 32000, true, 155),
  ('Bánh mì trứng', 'banh-mi-trung', 'MAIN_FOOD', 'Bánh mì giòn kẹp 2 trứng ốp la lòng đào và dưa leo', 25000, true, 156),
  ('Bánh mì thịt nướng', 'banh-mi-thit-nuong', 'MAIN_FOOD', 'Bánh mì thịt xiên nướng thơm lừng đồ chua ngò rí', 32000, true, 157),
  ('Bánh mì chả lụa', 'banh-mi-cha-lua', 'MAIN_FOOD', 'Bánh mì kẹp chả lụa truyền thống pate thơm béo', 30000, true, 158),
  ('Bánh xèo', 'banh-xeo', 'MAIN_FOOD', 'Bánh xèo vàng giòn nhân tôm thịt giá đỗ cuốn rau rừng', 49000, true, 159),
  ('Gỏi cuốn', 'goi-cuon', 'MAIN_FOOD', 'Đĩa 3 cuốn gỏi tôm thịt bún tươi chấm tương đậu phộng', 36000, true, 160),
  ('Há cảo hấp', 'ha-cao-hap', 'MAIN_FOOD', 'Xửng há cảo hấp nhân tôm thịt vỏ trong mềm mọng', 42000, true, 161),
  ('Sủi cảo nước', 'sui-cao-nuoc', 'MAIN_FOOD', 'Tô sủi cảo nóng hổi nước dùng hầm xương ngọt thanh', 49000, true, 162),
  ('Cơm cuộn Hàn Quốc', 'com-cuon-han-quoc', 'MAIN_FOOD', 'Kimbap cơm cuộn rong biển xúc xích thanh cua rau củ', 49000, true, 163),
  ('Tokbokki', 'tokbokki', 'MAIN_FOOD', 'Bánh gạo Hàn Quốc sốt cay ngọt chả cá và phô mai', 49000, true, 164),
  ('Gà sốt cay Hàn Quốc + cơm', 'ga-sot-cay-han-quoc-com', 'MAIN_FOOD', 'Gà rán phủ sốt cay ngọt Hàn Quốc ăn cùng cơm trắng', 65000, true, 165),
  ('Mì ly bò hầm', 'mi-ly-bo-ham', 'MAIN_FOOD', 'Mì ly ăn liền vị bò hầm tiện lợi chuẩn bị nhanh', 25000, true, 166),
  ('Mì ly hải sản', 'mi-ly-hai-san', 'MAIN_FOOD', 'Mì ly ăn liền vị hải sản chua cay nóng sốt', 25000, true, 167),
  ('Miến ly cua', 'mien-ly-cua', 'MAIN_FOOD', 'Miến ly ăn liền vị cua thơm ngon nhẹ bụng', 28000, true, 168),
  ('Cháo ly thịt bằm', 'chao-ly-thit-bam', 'MAIN_FOOD', 'Cháo ly ăn liền thịt bằm ấm bụng tiện lợi', 22000, true, 169)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    price_vnd = EXCLUDED.price_vnd,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = clock_timestamp();

-- ----------------------------------------------------------------------------
-- 2. Schema extensions on public.checkout_sessions & public.bookings
-- ----------------------------------------------------------------------------
ALTER TABLE public.checkout_sessions ADD COLUMN IF NOT EXISTS menu_amount_vnd BIGINT NOT NULL DEFAULT 0 CHECK (menu_amount_vnd >= 0);
ALTER TABLE public.checkout_sessions DROP CONSTRAINT IF EXISTS checkout_sessions_final_amount_calc;
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_final_amount_calc CHECK (final_payable_amount_vnd = (gross_amount_vnd - discount_amount_vnd) + menu_amount_vnd);

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS menu_amount_vnd BIGINT NOT NULL DEFAULT 0 CHECK (menu_amount_vnd >= 0);
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_final_paid_calc;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_final_paid_calc CHECK (final_paid_amount_vnd = (gross_amount_vnd - discount_amount_vnd) + menu_amount_vnd);

-- ----------------------------------------------------------------------------
-- 3. Tables for checkout menu selections & booking menu persistence
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkout_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id UUID NOT NULL REFERENCES public.checkout_sessions(id) ON DELETE CASCADE,
  menu_product_id UUID NOT NULL REFERENCES public.menu_products(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('PURCHASE', 'REWARD')),
  entitlement_id UUID REFERENCES public.user_reward_entitlements(id) ON DELETE SET NULL,
  unit_price_vnd INT NOT NULL CHECK (unit_price_vnd >= 0),
  total_price_vnd INT NOT NULL CHECK (total_price_vnd >= 0),
  normal_price_vnd INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_checkout_menu_items_session ON public.checkout_menu_items (checkout_session_id);

CREATE TABLE IF NOT EXISTS public.booking_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  menu_product_id UUID NOT NULL REFERENCES public.menu_products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('PURCHASE', 'REWARD')),
  entitlement_id UUID REFERENCES public.user_reward_entitlements(id) ON DELETE SET NULL,
  unit_price_vnd INT NOT NULL CHECK (unit_price_vnd >= 0),
  total_price_vnd INT NOT NULL CHECK (total_price_vnd >= 0),
  normal_price_vnd INT NOT NULL DEFAULT 0,
  reward_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_booking_menu_items_booking ON public.booking_menu_items (booking_id);

ALTER TABLE public.checkout_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_menu_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.checkout_menu_items FROM public, anon, authenticated;
GRANT SELECT ON public.checkout_menu_items TO authenticated;
GRANT ALL ON public.checkout_menu_items TO service_role;

REVOKE ALL ON public.booking_menu_items FROM public, anon, authenticated;
GRANT SELECT ON public.booking_menu_items TO authenticated;
GRANT ALL ON public.booking_menu_items TO service_role;

DROP POLICY IF EXISTS "Users can view own checkout menu items" ON public.checkout_menu_items;
CREATE POLICY "Users can view own checkout menu items"
  ON public.checkout_menu_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.checkout_sessions cs
      WHERE cs.id = checkout_menu_items.checkout_session_id AND cs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own booking menu items" ON public.booking_menu_items;
CREATE POLICY "Users can view own booking menu items"
  ON public.booking_menu_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_menu_items.booking_id AND b.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can view all booking menu items" ON public.booking_menu_items;
CREATE POLICY "Staff can view all booking menu items"
  ON public.booking_menu_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_roles sr
      WHERE sr.user_id = auth.uid() AND sr.role IN ('staff', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- 4. RPC: get_menu_products (Active menu catalog)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_menu_products(
  p_category TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_products JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', mp.id,
    'name', mp.name,
    'slug', mp.slug,
    'category', mp.category,
    'description', mp.description,
    'price_vnd', mp.price_vnd,
    'image_url', mp.image_url,
    'is_active', mp.is_active,
    'sort_order', mp.sort_order
  ) ORDER BY mp.sort_order ASC, mp.name ASC), '[]'::jsonb)
  INTO v_products
  FROM public.menu_products mp
  WHERE mp.is_active = true
    AND (p_category IS NULL OR mp.category = p_category);

  RETURN jsonb_build_object(
    'success', true,
    'products', v_products
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC: get_checkout_menu_items
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_checkout_menu_items(
  p_checkout_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_items JSONB;
  v_menu_amount BIGINT := 0;
BEGIN
  IF v_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.checkout_sessions
      WHERE id = p_checkout_session_id AND user_id = v_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', cmi.id,
      'menu_product_id', cmi.menu_product_id,
      'name', mp.name,
      'category', mp.category,
      'quantity', cmi.quantity,
      'source_type', cmi.source_type,
      'unit_price_vnd', cmi.unit_price_vnd,
      'total_price_vnd', cmi.total_price_vnd,
      'normal_price_vnd', cmi.normal_price_vnd,
      'entitlement_id', cmi.entitlement_id,
      'reward_title', sd.title
    ) ORDER BY cmi.source_type DESC, cmi.created_at ASC), '[]'::jsonb),
    COALESCE(SUM(cmi.total_price_vnd), 0)
  INTO v_items, v_menu_amount
  FROM public.checkout_menu_items cmi
  JOIN public.menu_products mp ON mp.id = cmi.menu_product_id
  LEFT JOIN public.user_reward_entitlements ue ON ue.id = cmi.entitlement_id
  LEFT JOIN public.streak_reward_definitions sd ON sd.id = ue.reward_definition_id
  WHERE cmi.checkout_session_id = p_checkout_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'items', v_items,
    'menu_amount_vnd', v_menu_amount
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC: update_checkout_menu_items_atomic
-- Validates:
--   - Session exists, active, owned by user
--   - Items must exist, be active, quantity > 0
--   - Authoritative pricing from public.menu_products
--   - Reward entitlements strictly verified:
--       * SNACK_X1: sum(SNACK qty) = 1
--       * SNACK_X2: sum(SNACK qty) = 2
--       * SNACK_COMBO: sum(SNACK qty) = 2 AND sum(DRINK qty) = 1
--       * MEAL_CHOICE: sum(MAIN_FOOD qty) = 1
--   - Updates checkout_sessions.menu_amount_vnd and final_payable_amount_vnd
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_checkout_menu_items_atomic(
  p_checkout_session_id UUID,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
  v_item RECORD;
  v_prod RECORD;
  v_ent RECORD;
  v_menu_addon_total BIGINT := 0;
  v_final_payable BIGINT;
  v_item_elem JSONB;
  v_ent_groups JSONB := '{}'::jsonb;
  v_ent_id TEXT;
  v_group RECORD;
  v_snack_qty INT;
  v_drink_qty INT;
  v_main_qty INT;
  v_used_ent_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- 1. Validate session
  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  IF v_user_id IS NOT NULL AND v_session.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_session.status NOT IN ('ACTIVE', 'PAYMENT_PROCESSING') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_SESSION_STATUS');
  END IF;

  IF v_session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_EXPIRED');
  END IF;

  -- 2. Release currently reserved physical entitlements for this session that might be removed
  UPDATE public.user_reward_entitlements
  SET status = 'AVAILABLE',
      checkout_session_id = NULL,
      updated_at = clock_timestamp()
  WHERE checkout_session_id = p_checkout_session_id
    AND status = 'RESERVED'
    AND id IN (
      SELECT ue.id FROM public.user_reward_entitlements ue
      JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
      WHERE ue.checkout_session_id = p_checkout_session_id
        AND sd.reward_type NOT IN ('DISCOUNT_30', 'DISCOUNT_40')
    );

  -- 3. Clear existing checkout menu items
  DELETE FROM public.checkout_menu_items
  WHERE checkout_session_id = p_checkout_session_id;

  -- If empty items array, reset menu_amount_vnd to 0
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    v_final_payable := v_session.gross_amount_vnd - v_session.discount_amount_vnd;
    UPDATE public.checkout_sessions
    SET menu_amount_vnd = 0,
        final_payable_amount_vnd = v_final_payable
    WHERE id = p_checkout_session_id;

    RETURN jsonb_build_object(
      'success', true,
      'menu_amount_vnd', 0,
      'final_payable_amount_vnd', v_final_payable,
      'items', '[]'::jsonb
    );
  END IF;

  -- 4. Validate each item and aggregate reward entitlements
  FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item_elem->>'menu_product_id') IS NULL OR (v_item_elem->>'quantity') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_MENU_ITEM_PAYLOAD');
    END IF;

    IF (v_item_elem->>'quantity')::INT <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY');
    END IF;

    -- Lookup menu product
    SELECT * INTO v_prod
    FROM public.menu_products
    WHERE id = (v_item_elem->>'menu_product_id')::UUID;

    IF v_prod.id IS NULL OR v_prod.is_active IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'INACTIVE_OR_INVALID_PRODUCT');
    END IF;

    IF (v_item_elem->>'source_type') = 'REWARD' THEN
      v_ent_id := v_item_elem->>'entitlement_id';
      IF v_ent_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_ID_REQUIRED_FOR_REWARD');
      END IF;

      -- Validate entitlement
      SELECT ue.*, sd.reward_type, sd.is_active AS def_is_active
      INTO v_ent
      FROM public.user_reward_entitlements ue
      JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
      WHERE ue.id = v_ent_id::UUID
      FOR UPDATE OF ue;

      IF v_ent.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_NOT_FOUND');
      END IF;

      IF v_ent.user_id <> v_session.user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ENTITLEMENT_OWNER');
      END IF;

      IF v_ent.status <> 'AVAILABLE' AND NOT (v_ent.status = 'RESERVED' AND v_ent.checkout_session_id = p_checkout_session_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_NOT_AVAILABLE');
      END IF;

      IF v_ent.expires_at <= clock_timestamp() THEN
        RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_EXPIRED');
      END IF;

      -- Group by entitlement to validate exact counts and categories
      IF NOT (v_ent_groups ? v_ent_id) THEN
        v_ent_groups := jsonb_set(
          v_ent_groups,
          ARRAY[v_ent_id],
          jsonb_build_object(
            'reward_type', v_ent.reward_type,
            'snack_qty', 0,
            'drink_qty', 0,
            'main_qty', 0
          )
        );
      END IF;

      IF v_prod.category = 'SNACK' THEN
        v_ent_groups := jsonb_set(
          v_ent_groups,
          ARRAY[v_ent_id, 'snack_qty'],
          to_jsonb(((v_ent_groups->v_ent_id->>'snack_qty')::INT + (v_item_elem->>'quantity')::INT))
        );
      ELSIF v_prod.category = 'DRINK' THEN
        v_ent_groups := jsonb_set(
          v_ent_groups,
          ARRAY[v_ent_id, 'drink_qty'],
          to_jsonb(((v_ent_groups->v_ent_id->>'drink_qty')::INT + (v_item_elem->>'quantity')::INT))
        );
      ELSIF v_prod.category = 'MAIN_FOOD' THEN
        v_ent_groups := jsonb_set(
          v_ent_groups,
          ARRAY[v_ent_id, 'main_qty'],
          to_jsonb(((v_ent_groups->v_ent_id->>'main_qty')::INT + (v_item_elem->>'quantity')::INT))
        );
      END IF;

      -- Insert checkout menu item with price 0
      INSERT INTO public.checkout_menu_items (
        checkout_session_id,
        menu_product_id,
        quantity,
        source_type,
        entitlement_id,
        unit_price_vnd,
        total_price_vnd,
        normal_price_vnd
      ) VALUES (
        p_checkout_session_id,
        v_prod.id,
        (v_item_elem->>'quantity')::INT,
        'REWARD',
        v_ent.id,
        0,
        0,
        v_prod.price_vnd
      );

      v_used_ent_ids := array_append(v_used_ent_ids, v_ent.id);
    ELSE
      -- PURCHASE
      INSERT INTO public.checkout_menu_items (
        checkout_session_id,
        menu_product_id,
        quantity,
        source_type,
        entitlement_id,
        unit_price_vnd,
        total_price_vnd,
        normal_price_vnd
      ) VALUES (
        p_checkout_session_id,
        v_prod.id,
        (v_item_elem->>'quantity')::INT,
        'PURCHASE',
        NULL,
        v_prod.price_vnd,
        v_prod.price_vnd * (v_item_elem->>'quantity')::INT,
        v_prod.price_vnd
      );

      v_menu_addon_total := v_menu_addon_total + (v_prod.price_vnd * (v_item_elem->>'quantity')::INT);
    END IF;
  END LOOP;

  -- 5. Validate reward quotas for each used entitlement
  FOR v_ent_id IN SELECT jsonb_object_keys(v_ent_groups)
  LOOP
    v_snack_qty := (v_ent_groups->v_ent_id->>'snack_qty')::INT;
    v_drink_qty := (v_ent_groups->v_ent_id->>'drink_qty')::INT;
    v_main_qty := (v_ent_groups->v_ent_id->>'main_qty')::INT;

    CASE (v_ent_groups->v_ent_id->>'reward_type')
      WHEN 'SNACK_X1' THEN
        IF v_snack_qty <> 1 OR v_drink_qty <> 0 OR v_main_qty <> 0 THEN
          RETURN jsonb_build_object('success', false, 'error', 'SNACK_X1_QUOTA_MISMATCH');
        END IF;
      WHEN 'SNACK_X2' THEN
        IF v_snack_qty <> 2 OR v_drink_qty <> 0 OR v_main_qty <> 0 THEN
          RETURN jsonb_build_object('success', false, 'error', 'SNACK_X2_QUOTA_MISMATCH');
        END IF;
      WHEN 'SNACK_COMBO' THEN
        IF v_snack_qty <> 2 OR v_drink_qty <> 1 OR v_main_qty <> 0 THEN
          RETURN jsonb_build_object('success', false, 'error', 'SNACK_COMBO_QUOTA_MISMATCH');
        END IF;
      WHEN 'MEAL_CHOICE' THEN
        IF v_main_qty <> 1 OR v_snack_qty <> 0 OR v_drink_qty <> 0 THEN
          RETURN jsonb_build_object('success', false, 'error', 'MEAL_CHOICE_QUOTA_MISMATCH');
        END IF;
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'UNSUPPORTED_REWARD_TYPE_FOR_MENU');
    END CASE;

    -- Reserve entitlement for session
    UPDATE public.user_reward_entitlements
    SET status = 'RESERVED',
        checkout_session_id = p_checkout_session_id,
        updated_at = clock_timestamp()
    WHERE id = v_ent_id::UUID;
  END LOOP;

  -- 6. Update session totals
  v_final_payable := (v_session.gross_amount_vnd - v_session.discount_amount_vnd) + v_menu_addon_total;

  UPDATE public.checkout_sessions
  SET menu_amount_vnd = v_menu_addon_total,
      final_payable_amount_vnd = v_final_payable
  WHERE id = p_checkout_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'menu_amount_vnd', v_menu_addon_total,
    'final_payable_amount_vnd', v_final_payable
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Upgrade: claim_daily_reward (Strictly enforce streak progression)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE;
  v_checkin_id UUID;
  v_existing_checkin_id UUID;
  v_balance NUMERIC(20, 5);
  v_streak_rec RECORD;
  v_current_streak INT;
  v_longest_streak INT;
  v_streak_cycle_id INT;
  v_cycle_started_at TIMESTAMPTZ;
  v_def RECORD;
  v_milestone_reached INT := NULL;
  v_reward_issued JSONB := NULL;
  v_new_entitlement_id UUID;
  v_issued_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_next_milestone_day INT := NULL;
  v_next_milestone_title TEXT := NULL;
  v_next_milestone JSONB := NULL;
BEGIN
  -- 1. Authenticated user validation
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 2. Serialize user loyalty writes using profile row lock
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  -- 3. Determine calendar day in Vietnam time (Asia/Ho_Chi_Minh)
  v_today := (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;

  -- 4. Check if user already claimed reward today
  SELECT id INTO v_existing_checkin_id
  FROM public.daily_checkins
  WHERE user_id = v_user_id AND checkin_date = v_today;

  IF v_existing_checkin_id IS NOT NULL THEN
    SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
    FROM public.loyalty_transactions
    WHERE user_id = v_user_id;

    SELECT current_streak, longest_streak INTO v_streak_rec
    FROM public.user_reward_streaks
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED_TODAY',
      'already_claimed', true,
      'points_balance', v_balance,
      'current_streak', GREATEST(1, COALESCE(v_streak_rec.current_streak, 1)),
      'longest_streak', GREATEST(1, COALESCE(v_streak_rec.longest_streak, 1)),
      'checkin_date', v_today
    );
  END IF;

  -- 5. Record daily check-in and append to loyalty ledger atomically
  v_checkin_id := gen_random_uuid();

  INSERT INTO public.daily_checkins (
    id,
    user_id,
    checkin_date,
    reward_points,
    created_at
  ) VALUES (
    v_checkin_id,
    v_user_id,
    v_today,
    5.0000,
    clock_timestamp()
  );

  INSERT INTO public.loyalty_transactions (
    user_id,
    type,
    points_delta,
    daily_checkin_id,
    description,
    created_at
  ) VALUES (
    v_user_id,
    'daily_checkin_earn',
    5.00000,
    v_checkin_id,
    'Điểm danh hằng ngày +5 điểm (' || to_char(v_today, 'DD/MM/YYYY') || ')',
    clock_timestamp()
  );

  -- 6. Lock and update/insert user streak state
  SELECT * INTO v_streak_rec
  FROM public.user_reward_streaks
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_streak_rec.user_id IS NULL THEN
    -- First ever check-in for this user => current_streak = 1
    v_current_streak := 1;
    v_longest_streak := 1;
    v_streak_cycle_id := 1;
    v_cycle_started_at := clock_timestamp();

    INSERT INTO public.user_reward_streaks (
      user_id,
      current_streak,
      longest_streak,
      last_checkin_date,
      streak_cycle_id,
      streak_cycle_started_at,
      updated_at
    ) VALUES (
      v_user_id,
      1,
      1,
      v_today,
      1,
      v_cycle_started_at,
      clock_timestamp()
    );
  ELSE
    -- User has previous streak record
    IF v_streak_rec.last_checkin_date = (v_today - 1) THEN
      -- Consecutive day check-in: increase streak
      v_current_streak := v_streak_rec.current_streak + 1;
      v_streak_cycle_id := v_streak_rec.streak_cycle_id;
      v_cycle_started_at := v_streak_rec.streak_cycle_started_at;
    ELSE
      -- Missed 1 or more days: reset streak to 1, start new streak cycle!
      v_current_streak := 1;
      v_streak_cycle_id := v_streak_rec.streak_cycle_id + 1;
      v_cycle_started_at := clock_timestamp();
    END IF;

    v_longest_streak := GREATEST(v_streak_rec.longest_streak, v_current_streak);

    UPDATE public.user_reward_streaks
    SET current_streak = v_current_streak,
        longest_streak = v_longest_streak,
        last_checkin_date = v_today,
        streak_cycle_id = v_streak_cycle_id,
        streak_cycle_started_at = v_cycle_started_at,
        updated_at = clock_timestamp()
    WHERE user_id = v_user_id;
  END IF;

  -- 7. Automatic Milestone Issue (10, 20, 40, 80, 150, 365)
  SELECT * INTO v_def
  FROM public.streak_reward_definitions
  WHERE milestone_day = v_current_streak AND is_active = true;

  IF v_def.id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_reward_entitlements
      WHERE user_id = v_user_id
        AND streak_cycle_id = v_streak_cycle_id
        AND milestone_day = v_current_streak
    ) THEN
      v_issued_at := clock_timestamp();
      v_expires_at := v_issued_at + (v_def.expiry_days || ' days')::INTERVAL;
      v_new_entitlement_id := gen_random_uuid();

      INSERT INTO public.user_reward_entitlements (
        id,
        user_id,
        reward_definition_id,
        milestone_day,
        streak_cycle_id,
        status,
        issued_at,
        expires_at
      ) VALUES (
        v_new_entitlement_id,
        v_user_id,
        v_def.id,
        v_current_streak,
        v_streak_cycle_id,
        'AVAILABLE',
        v_issued_at,
        v_expires_at
      );

      v_milestone_reached := v_current_streak;
      v_reward_issued := jsonb_build_object(
        'id', v_new_entitlement_id,
        'reward_type', v_def.reward_type,
        'title', v_def.title,
        'description', v_def.description,
        'expires_at', v_expires_at
      );
    END IF;
  END IF;

  -- 8. Calculate next milestone
  SELECT milestone_day, title INTO v_next_milestone_day, v_next_milestone_title
  FROM public.streak_reward_definitions
  WHERE milestone_day > v_current_streak AND is_active = true
  ORDER BY milestone_day ASC
  LIMIT 1;

  IF v_next_milestone_day IS NOT NULL THEN
    v_next_milestone := jsonb_build_object(
      'day', v_next_milestone_day,
      'days_left', (v_next_milestone_day - v_current_streak),
      'title', v_next_milestone_title
    );
  END IF;

  -- 9. Ledger points balance
  SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
  FROM public.loyalty_transactions
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'points_added', 5,
    'points_balance', v_balance,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'milestone_reached', v_milestone_reached,
    'reward_issued', v_reward_issued,
    'next_milestone', v_next_milestone,
    'checkin_date', v_today
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
    FROM public.loyalty_transactions
    WHERE user_id = v_user_id;

    SELECT current_streak, longest_streak INTO v_streak_rec
    FROM public.user_reward_streaks
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED_TODAY',
      'already_claimed', true,
      'points_balance', v_balance,
      'current_streak', GREATEST(1, COALESCE(v_streak_rec.current_streak, 1)),
      'longest_streak', GREATEST(1, COALESCE(v_streak_rec.longest_streak, 1)),
      'checkin_date', v_today
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Upgrade: get_my_rewards_summary (Fix streak display bug and sync)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_rewards_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance NUMERIC(20, 5);
  v_today DATE;
  v_has_checked_in BOOLEAN;
  v_available_vouchers_count INT;
  v_points_needed NUMERIC(20, 5);
  v_redeemable_vouchers_count INT;
  v_vouchers JSONB;
  v_recent_transactions JSONB;
  v_streak_rec RECORD;
  v_active_streak INT := 0;
  v_longest_streak INT := 0;
  v_is_streak_broken BOOLEAN := false;
  v_next_milestone_day INT := NULL;
  v_next_milestone_title TEXT := NULL;
  v_next_milestone JSONB := NULL;
  v_streak_roadmap JSONB;
  v_entitlements JSONB;
  v_available_entitlements_count INT := 0;
BEGIN
  -- 1. Authenticated user validation
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 2. Opportunistically mark expired AVAILABLE vouchers and entitlements
  UPDATE public.voucher_redemptions
  SET status = 'EXPIRED'
  WHERE user_id = v_user_id
    AND status = 'AVAILABLE'
    AND expires_at <= clock_timestamp();

  UPDATE public.user_reward_entitlements
  SET status = 'EXPIRED'
  WHERE user_id = v_user_id
    AND status = 'AVAILABLE'
    AND expires_at <= clock_timestamp();

  -- 3. Calculate current point balance
  SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
  FROM public.loyalty_transactions
  WHERE user_id = v_user_id;

  -- 4. Check if checked in today in Vietnam time
  v_today := (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
  SELECT EXISTS(
    SELECT 1 FROM public.daily_checkins
    WHERE user_id = v_user_id AND checkin_date = v_today
  ) INTO v_has_checked_in;

  -- 5. Read streak data and compute active streak
  SELECT * INTO v_streak_rec
  FROM public.user_reward_streaks
  WHERE user_id = v_user_id;

  IF v_has_checked_in THEN
    -- If user checked in today, current_streak MUST be >= 1!
    v_active_streak := GREATEST(1, COALESCE(v_streak_rec.current_streak, 1));
    v_longest_streak := GREATEST(v_active_streak, COALESCE(v_streak_rec.longest_streak, 1));
    v_is_streak_broken := false;

    -- Self-heal / sync user_reward_streaks table if missing or dated
    INSERT INTO public.user_reward_streaks (
      user_id,
      current_streak,
      longest_streak,
      last_checkin_date,
      streak_cycle_id,
      streak_cycle_started_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_active_streak,
      v_longest_streak,
      v_today,
      COALESCE(v_streak_rec.streak_cycle_id, 1),
      COALESCE(v_streak_rec.streak_cycle_started_at, clock_timestamp()),
      clock_timestamp()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      current_streak = EXCLUDED.current_streak,
      longest_streak = GREATEST(user_reward_streaks.longest_streak, EXCLUDED.longest_streak),
      last_checkin_date = EXCLUDED.last_checkin_date,
      updated_at = clock_timestamp();
  ELSE
    -- Not checked in today
    IF v_streak_rec.user_id IS NOT NULL THEN
      v_longest_streak := v_streak_rec.longest_streak;
      IF v_streak_rec.last_checkin_date = (v_today - 1) THEN
        -- Checked in yesterday => streak is active, waiting for check-in today
        v_active_streak := v_streak_rec.current_streak;
        v_is_streak_broken := false;
      ELSE
        -- Missed 1 or more days => streak is broken!
        v_active_streak := 0;
        v_is_streak_broken := true;
      END IF;
    ELSE
      v_active_streak := 0;
      v_longest_streak := 0;
      v_is_streak_broken := false;
    END IF;
  END IF;

  -- 6. Calculate voucher readiness (500 pts)
  IF v_balance >= 500 THEN
    v_points_needed := 0;
  ELSE
    v_points_needed := 500 - v_balance;
  END IF;

  v_redeemable_vouchers_count := FLOOR(v_balance / 500)::INT;

  -- 7. Count available active vouchers (500-pt + streak discount vouchers)
  SELECT (
    (SELECT COUNT(*) FROM public.voucher_redemptions WHERE user_id = v_user_id AND status = 'AVAILABLE' AND expires_at > clock_timestamp())
    +
    (SELECT COUNT(*) FROM public.user_reward_entitlements ue
     JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
     WHERE ue.user_id = v_user_id AND ue.status = 'AVAILABLE' AND ue.expires_at > clock_timestamp() AND sd.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40'))
  ) INTO v_available_vouchers_count;

  -- 8. Fetch user vouchers
  SELECT COALESCE(jsonb_agg(v_item ORDER BY expires_at ASC), '[]'::jsonb)
  INTO v_vouchers
  FROM (
    SELECT
      vr.id,
      'POINTS_500' AS source,
      v.name,
      v.discount_percentage,
      v.max_eligible_base_vnd,
      vr.status,
      vr.issued_at,
      vr.expires_at,
      vr.used_at,
      vr.booking_id
    FROM public.voucher_redemptions vr
    JOIN public.vouchers v ON v.id = vr.voucher_id
    WHERE vr.user_id = v_user_id

    UNION ALL

    SELECT
      ue.id,
      CASE WHEN sd.reward_type = 'DISCOUNT_30' THEN '150_DAY_STREAK' ELSE '365_DAY_STREAK' END AS source,
      sd.title AS name,
      sd.discount_percentage,
      sd.max_eligible_base_vnd,
      ue.status,
      ue.issued_at,
      ue.expires_at,
      ue.used_at,
      ue.booking_id
    FROM public.user_reward_entitlements ue
    JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
    WHERE ue.user_id = v_user_id AND sd.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40')
  ) v_item;

  -- 9. Fetch user physical and food reward entitlements
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ue.id,
    'milestone_day', ue.milestone_day,
    'reward_type', sd.reward_type,
    'title', sd.title,
    'description', sd.description,
    'status', ue.status,
    'issued_at', ue.issued_at,
    'expires_at', ue.expires_at,
    'used_at', ue.used_at,
    'booking_id', ue.booking_id,
    'selection_data', ue.selection_data
  ) ORDER BY ue.issued_at DESC), '[]'::jsonb),
  COUNT(*) FILTER (WHERE ue.status = 'AVAILABLE' AND ue.expires_at > clock_timestamp())
  INTO v_entitlements, v_available_entitlements_count
  FROM public.user_reward_entitlements ue
  JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
  WHERE ue.user_id = v_user_id AND sd.reward_type NOT IN ('DISCOUNT_30', 'DISCOUNT_40');

  -- 10. Fetch recent transactions
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'type', type,
    'points_delta', points_delta,
    'description', description,
    'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_recent_transactions
  FROM (
    SELECT *
    FROM public.loyalty_transactions
    WHERE user_id = v_user_id
    ORDER BY created_at DESC
    LIMIT 20
  ) tx;

  -- 11. Calculate next milestone
  SELECT milestone_day, title INTO v_next_milestone_day, v_next_milestone_title
  FROM public.streak_reward_definitions
  WHERE milestone_day > v_active_streak AND is_active = true
  ORDER BY milestone_day ASC
  LIMIT 1;

  IF v_next_milestone_day IS NOT NULL THEN
    v_next_milestone := jsonb_build_object(
      'day', v_next_milestone_day,
      'days_left', (v_next_milestone_day - v_active_streak),
      'title', v_next_milestone_title
    );
  END IF;

  -- 12. Build milestone roadmap
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'milestone_day', sd.milestone_day,
    'reward_type', sd.reward_type,
    'title', sd.title,
    'description', sd.description,
    'is_unlocked', (v_active_streak >= sd.milestone_day),
    'is_current_target', (sd.milestone_day = v_next_milestone_day)
  ) ORDER BY sd.milestone_day ASC), '[]'::jsonb)
  INTO v_streak_roadmap
  FROM public.streak_reward_definitions sd
  WHERE sd.is_active = true;

  -- 13. Canonical composite response
  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'points_balance', v_balance,
    'has_checked_in_today', v_has_checked_in,
    'checkin_date', v_today,
    'current_streak', v_active_streak,
    'longest_streak', v_longest_streak,
    'is_streak_broken', v_is_streak_broken,
    'next_milestone', v_next_milestone,
    'streak_roadmap', v_streak_roadmap,
    'available_vouchers_count', v_available_vouchers_count,
    'points_needed_for_next_voucher', v_points_needed,
    'redeemable_vouchers_count', v_redeemable_vouchers_count,
    'vouchers', v_vouchers,
    'entitlements', v_entitlements,
    'available_entitlements_count', v_available_entitlements_count,
    'recent_transactions', v_recent_transactions
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Upgrade: reserve_checkout_voucher_atomic (Preserve menu_amount_vnd)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_checkout_voucher_atomic(
  p_checkout_session_id UUID,
  p_voucher_redemption_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
  v_redemption RECORD;
  v_eligible_base BIGINT;
  v_discount BIGINT;
  v_final_payable BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  IF v_session.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_session.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_SESSION_STATUS');
  END IF;

  IF v_session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_EXPIRED');
  END IF;

  IF v_session.discount_amount_vnd > 0 OR EXISTS (
    SELECT 1 FROM public.voucher_redemptions vr
    WHERE vr.checkout_session_id = p_checkout_session_id
      AND vr.status = 'RESERVED'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_ALREADY_RESERVED');
  END IF;

  SELECT vr.*, v.is_active AS def_is_active, v.voucher_type, v.discount_percentage, v.max_eligible_base_vnd
  INTO v_redemption
  FROM public.voucher_redemptions vr
  JOIN public.vouchers v ON v.id = vr.voucher_id
  WHERE vr.id = p_voucher_redemption_id
  FOR UPDATE OF vr;

  IF v_redemption.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_NOT_FOUND');
  END IF;

  IF v_redemption.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_redemption.status <> 'AVAILABLE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_NOT_AVAILABLE');
  END IF;

  IF v_redemption.expires_at <= clock_timestamp() THEN
    UPDATE public.voucher_redemptions
    SET status = 'EXPIRED'
    WHERE id = v_redemption.id;

    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_EXPIRED');
  END IF;

  IF v_redemption.def_is_active IS NOT TRUE
     OR v_redemption.voucher_type <> 'percentage_discount'
     OR v_redemption.discount_percentage <> 40.00
     OR v_redemption.max_eligible_base_vnd <> 1000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_DEFINITION_INVALID');
  END IF;

  v_eligible_base := LEAST(v_session.gross_amount_vnd, 1000000::bigint);
  v_discount := LEAST(
    ROUND(v_eligible_base::numeric * 0.40)::bigint,
    400000::bigint,
    v_session.gross_amount_vnd
  );
  v_final_payable := (v_session.gross_amount_vnd - v_discount) + COALESCE(v_session.menu_amount_vnd, 0);

  UPDATE public.voucher_redemptions
  SET status = 'RESERVED',
      checkout_session_id = p_checkout_session_id,
      discount_amount_vnd = v_discount
  WHERE id = p_voucher_redemption_id;

  UPDATE public.checkout_sessions
  SET discount_amount_vnd = v_discount,
      final_payable_amount_vnd = v_final_payable
  WHERE id = p_checkout_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'voucher_redemption_id', p_voucher_redemption_id,
    'checkout_session', jsonb_build_object(
      'id', v_session.id,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', v_discount,
      'menu_amount_vnd', COALESCE(v_session.menu_amount_vnd, 0),
      'final_payable_amount_vnd', v_final_payable,
      'status', v_session.status,
      'expires_at', v_session.expires_at,
      'payment_reference', v_session.payment_reference
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Upgrade: release_checkout_voucher_atomic (Preserve menu_amount_vnd)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_checkout_voucher_atomic(
  p_checkout_session_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
  v_redemption RECORD;
  v_target_status TEXT;
  v_final_payable BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  IF v_session.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_session.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_SESSION_STATUS');
  END IF;

  SELECT * INTO v_redemption
  FROM public.voucher_redemptions
  WHERE checkout_session_id = p_checkout_session_id
    AND status = 'RESERVED'
  FOR UPDATE;

  IF v_redemption.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_RESERVED_VOUCHER_ATTACHED');
  END IF;

  IF v_redemption.expires_at <= clock_timestamp() THEN
    v_target_status := 'EXPIRED';
  ELSE
    v_target_status := 'AVAILABLE';
  END IF;

  UPDATE public.voucher_redemptions
  SET status = v_target_status,
      checkout_session_id = NULL,
      discount_amount_vnd = NULL
  WHERE id = v_redemption.id;

  v_final_payable := v_session.gross_amount_vnd + COALESCE(v_session.menu_amount_vnd, 0);

  UPDATE public.checkout_sessions
  SET discount_amount_vnd = 0,
      final_payable_amount_vnd = v_final_payable
  WHERE id = p_checkout_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'released_redemption_id', v_redemption.id,
    'new_redemption_status', v_target_status,
    'checkout_session', jsonb_build_object(
      'id', v_session.id,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', 0,
      'menu_amount_vnd', COALESCE(v_session.menu_amount_vnd, 0),
      'final_payable_amount_vnd', v_final_payable,
      'status', v_session.status,
      'expires_at', v_session.expires_at,
      'payment_reference', v_session.payment_reference
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. Upgrade: reserve_checkout_reward_entitlement_atomic (Preserve menu_amount_vnd)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_checkout_reward_entitlement_atomic(
  p_checkout_session_id UUID,
  p_entitlement_id UUID,
  p_menu_item_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
  v_entitlement RECORD;
  v_def RECORD;
  v_menu_item RECORD;
  v_eligible_base BIGINT;
  v_discount BIGINT;
  v_final_payable BIGINT;
  v_selection_data JSONB := NULL;
  v_rate NUMERIC;
  v_cap BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  IF v_session.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_session.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_SESSION_STATUS');
  END IF;

  IF v_session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_EXPIRED');
  END IF;

  SELECT ue.*, sd.reward_type, sd.discount_percentage, sd.max_eligible_base_vnd, sd.max_discount_vnd, sd.is_active AS def_is_active, sd.title
  INTO v_entitlement
  FROM public.user_reward_entitlements ue
  JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
  WHERE ue.id = p_entitlement_id
  FOR UPDATE OF ue;

  IF v_entitlement.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_NOT_FOUND');
  END IF;

  IF v_entitlement.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_entitlement.status <> 'AVAILABLE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_NOT_AVAILABLE');
  END IF;

  IF v_entitlement.expires_at <= clock_timestamp() THEN
    UPDATE public.user_reward_entitlements
    SET status = 'EXPIRED'
    WHERE id = v_entitlement.id;

    RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_EXPIRED');
  END IF;

  IF v_entitlement.def_is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_DEFINITION_INACTIVE');
  END IF;

  IF v_entitlement.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40') THEN
    IF v_session.discount_amount_vnd > 0
       OR EXISTS (SELECT 1 FROM public.voucher_redemptions WHERE checkout_session_id = p_checkout_session_id AND status = 'RESERVED')
       OR EXISTS (
         SELECT 1 FROM public.user_reward_entitlements ue2
         JOIN public.streak_reward_definitions sd2 ON ue2.reward_definition_id = sd2.id
         WHERE ue2.checkout_session_id = p_checkout_session_id
           AND ue2.status = 'RESERVED'
           AND sd2.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40')
       ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'DISCOUNT_ALREADY_RESERVED');
    END IF;

    IF v_entitlement.reward_type = 'DISCOUNT_30' THEN
      v_rate := 0.30;
      v_cap := 300000;
    ELSE
      v_rate := 0.40;
      v_cap := 400000;
    END IF;

    v_eligible_base := LEAST(v_session.gross_amount_vnd, 1000000::bigint);
    v_discount := LEAST(ROUND(v_eligible_base::numeric * v_rate)::bigint, v_cap, v_session.gross_amount_vnd);
    v_final_payable := (v_session.gross_amount_vnd - v_discount) + COALESCE(v_session.menu_amount_vnd, 0);

    UPDATE public.user_reward_entitlements
    SET status = 'RESERVED',
        checkout_session_id = p_checkout_session_id,
        updated_at = clock_timestamp()
    WHERE id = p_entitlement_id;

    UPDATE public.checkout_sessions
    SET discount_amount_vnd = v_discount,
        final_payable_amount_vnd = v_final_payable
    WHERE id = p_checkout_session_id;

  ELSE
    IF EXISTS (
      SELECT 1 FROM public.user_reward_entitlements ue2
      JOIN public.streak_reward_definitions sd2 ON ue2.reward_definition_id = sd2.id
      WHERE ue2.checkout_session_id = p_checkout_session_id
        AND ue2.status = 'RESERVED'
        AND sd2.reward_type NOT IN ('DISCOUNT_30', 'DISCOUNT_40')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'PHYSICAL_REWARD_ALREADY_RESERVED');
    END IF;

    IF v_entitlement.reward_type = 'MEAL_CHOICE' THEN
      IF p_menu_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'MEAL_SELECTION_REQUIRED');
      END IF;

      -- Check in menu_products first, then reward_menu_items
      SELECT id, name INTO v_menu_item
      FROM public.menu_products
      WHERE id = p_menu_item_id AND is_active = true AND category = 'MAIN_FOOD';

      IF v_menu_item.id IS NULL THEN
        SELECT id, name INTO v_menu_item
        FROM public.reward_menu_items
        WHERE id = p_menu_item_id AND is_active = true;
      END IF;

      IF v_menu_item.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_OR_INACTIVE_MEAL_ITEM');
      END IF;

      v_selection_data := jsonb_build_object(
        'menu_item_id', v_menu_item.id,
        'menu_item_name', v_menu_item.name
      );
    ELSE
      v_selection_data := jsonb_build_object('reward_type', v_entitlement.reward_type);
    END IF;

    UPDATE public.user_reward_entitlements
    SET status = 'RESERVED',
        checkout_session_id = p_checkout_session_id,
        selection_data = v_selection_data,
        updated_at = clock_timestamp()
    WHERE id = p_entitlement_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'entitlement_id', p_entitlement_id,
    'reward_type', v_entitlement.reward_type,
    'selection_data', v_selection_data,
    'checkout_session', jsonb_build_object(
      'id', v_session.id,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', COALESCE(v_discount, v_session.discount_amount_vnd),
      'menu_amount_vnd', COALESCE(v_session.menu_amount_vnd, 0),
      'final_payable_amount_vnd', COALESCE(v_final_payable, v_session.final_payable_amount_vnd)
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. Upgrade: release_checkout_reward_entitlement_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_checkout_reward_entitlement_atomic(
  p_checkout_session_id UUID,
  p_entitlement_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
  v_ent RECORD;
  v_has_discount_released BOOLEAN := false;
  v_final_payable BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  IF v_session.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_session.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_SESSION_STATUS');
  END IF;

  FOR v_ent IN
    SELECT ue.*, sd.reward_type
    FROM public.user_reward_entitlements ue
    JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
    WHERE ue.checkout_session_id = p_checkout_session_id
      AND ue.status = 'RESERVED'
      AND (p_entitlement_id IS NULL OR ue.id = p_entitlement_id)
    FOR UPDATE OF ue
  LOOP
    IF v_ent.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40') THEN
      v_has_discount_released := true;
    END IF;

    UPDATE public.user_reward_entitlements
    SET status = CASE WHEN expires_at <= clock_timestamp() THEN 'EXPIRED' ELSE 'AVAILABLE' END,
        checkout_session_id = NULL,
        selection_data = NULL,
        updated_at = clock_timestamp()
    WHERE id = v_ent.id;
  END LOOP;

  IF v_has_discount_released THEN
    v_final_payable := v_session.gross_amount_vnd + COALESCE(v_session.menu_amount_vnd, 0);

    UPDATE public.checkout_sessions
    SET discount_amount_vnd = 0,
        final_payable_amount_vnd = v_final_payable
    WHERE id = p_checkout_session_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'discount_released', v_has_discount_released,
    'checkout_session', jsonb_build_object(
      'id', v_session.id,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', CASE WHEN v_has_discount_released THEN 0 ELSE v_session.discount_amount_vnd END,
      'menu_amount_vnd', COALESCE(v_session.menu_amount_vnd, 0),
      'final_payable_amount_vnd', CASE WHEN v_has_discount_released THEN v_final_payable ELSE v_session.final_payable_amount_vnd END
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 13. Upgrade: finalize_verified_checkout_atomic (Menu persistence + Idempotency)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_verified_checkout_atomic(
  p_checkout_session_id UUID,
  p_verified_paid_amount_vnd BIGINT,
  p_verified_payment_reference TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session RECORD;
  v_existing_booking RECORD;
  v_room RECORD;
  v_redemption_id UUID := NULL;
  v_redemption_expires_at TIMESTAMPTZ;
  v_redemption_discount BIGINT;
  v_voucher_is_active BOOLEAN;
  v_voucher_type TEXT;
  v_discount_percentage NUMERIC(5, 2);
  v_max_eligible_base_vnd BIGINT;
  v_ent_discount_rec RECORD;
  v_ent_physical_rec RECORD;
  v_booking_id UUID;
  v_points_earned NUMERIC(20, 5);
BEGIN
  -- 1. Lock checkout session FOR UPDATE
  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  -- 2. Idempotency Check: if session is already COMPLETED
  IF v_session.status = 'COMPLETED' THEN
    SELECT * INTO v_existing_booking
    FROM public.bookings
    WHERE checkout_session_id = p_checkout_session_id;

    IF v_existing_booking.id IS NOT NULL THEN
      IF v_existing_booking.final_paid_amount_vnd = p_verified_paid_amount_vnd
         AND v_session.payment_reference = p_verified_payment_reference THEN
        RETURN jsonb_build_object(
          'success', true,
          'idempotent', true,
          'booking', jsonb_build_object(
            'id', v_existing_booking.id,
            'checkout_session_id', v_existing_booking.checkout_session_id,
            'user_id', v_existing_booking.user_id,
            'room_id', v_existing_booking.room_id,
            'check_in_at', v_existing_booking.check_in_at,
            'check_out_at', v_existing_booking.check_out_at,
            'check_in', v_existing_booking.check_in,
            'check_out', v_existing_booking.check_out,
            'guest_count', v_existing_booking.guest_count,
            'gross_amount_vnd', v_existing_booking.gross_amount_vnd,
            'discount_amount_vnd', v_existing_booking.discount_amount_vnd,
            'menu_amount_vnd', v_existing_booking.menu_amount_vnd,
            'final_paid_amount_vnd', v_existing_booking.final_paid_amount_vnd,
            'payment_status', v_existing_booking.payment_status,
            'booking_status', v_existing_booking.booking_status
          )
        );
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'VERIFIED_AMOUNT_OR_REFERENCE_MISMATCH_ON_COMPLETED');
      END IF;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'COMPLETED_SESSION_WITHOUT_BOOKING');
    END IF;
  END IF;

  -- 3. Validate checkout session status
  IF v_session.status NOT IN ('ACTIVE', 'PAYMENT_PROCESSING') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_SESSION_STATUS');
  END IF;

  -- 4. Validate expiration
  IF v_session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_EXPIRED');
  END IF;

  -- 5. Validate payment reference
  IF p_verified_payment_reference IS NULL
     OR trim(p_verified_payment_reference) = ''
     OR p_verified_payment_reference <> v_session.payment_reference THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAYMENT_REFERENCE_MISMATCH');
  END IF;

  -- 6. Validate payment amount (must match final payable amount exactly)
  IF p_verified_paid_amount_vnd IS NULL
     OR p_verified_paid_amount_vnd <> v_session.final_payable_amount_vnd THEN
    RETURN jsonb_build_object('success', false, 'error', 'VERIFIED_AMOUNT_MISMATCH');
  END IF;

  -- 7. Lock Room row FOR UPDATE to serialize concurrent finalizations for the same room
  SELECT r.id, r.is_listed, r.capacity INTO v_room
  FROM public.rooms r
  JOIN public.properties p ON p.id = r.property_id
  WHERE r.id = v_session.room_id AND p.is_active = true
  FOR UPDATE OF r;

  IF v_room.id IS NULL OR v_room.is_listed IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
  END IF;

  -- Re-validate room capacity
  IF v_session.guest_count > v_room.capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'GUEST_COUNT_EXCEEDS_CAPACITY');
  END IF;

  -- Re-check inventory availability for confirmed / completed stays
  IF v_session.check_in_at IS NOT NULL AND v_session.check_out_at IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.room_id = v_session.room_id
        AND LOWER(b.booking_status) IN ('confirmed', 'completed')
        AND (
          (b.check_in_at IS NOT NULL AND b.check_out_at IS NOT NULL
           AND b.check_in_at < v_session.check_out_at AND b.check_out_at > v_session.check_in_at)
          OR
          (b.check_in_at IS NULL
           AND b.check_in < (v_session.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
           AND b.check_out > (v_session.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
        )
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.room_availability_blocks rab
      WHERE rab.room_id = v_session.room_id
        AND rab.starts_at < v_session.check_out_at
        AND rab.ends_at > v_session.check_in_at
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.room_id = v_session.room_id
        AND LOWER(b.booking_status) IN ('confirmed', 'completed')
        AND b.check_in < v_session.check_out
        AND b.check_out > v_session.check_in
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;
  END IF;

  -- 8. Validate Discount Voucher / Entitlement state
  IF v_session.discount_amount_vnd > 0 THEN
    SELECT vr.id, vr.expires_at, vr.discount_amount_vnd, v.is_active, v.voucher_type, v.discount_percentage, v.max_eligible_base_vnd
    INTO v_redemption_id, v_redemption_expires_at, v_redemption_discount, v_voucher_is_active, v_voucher_type, v_discount_percentage, v_max_eligible_base_vnd
    FROM public.voucher_redemptions vr
    JOIN public.vouchers v ON v.id = vr.voucher_id
    WHERE vr.checkout_session_id = v_session.id
      AND vr.status = 'RESERVED'
      AND vr.user_id = v_session.user_id
    FOR UPDATE OF vr;

    IF v_redemption_id IS NOT NULL THEN
      IF v_redemption_expires_at <= clock_timestamp()
         OR v_redemption_discount <> v_session.discount_amount_vnd
         OR v_voucher_is_active IS NOT TRUE
         OR v_voucher_type <> 'percentage_discount'
         OR v_discount_percentage <> 40.00
         OR v_max_eligible_base_vnd <> 1000000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_STATE_INVALID');
      END IF;
    ELSE
      SELECT ue.id, ue.expires_at, sd.reward_type, sd.discount_percentage, sd.max_discount_vnd, sd.is_active
      INTO v_ent_discount_rec
      FROM public.user_reward_entitlements ue
      JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
      WHERE ue.checkout_session_id = v_session.id
        AND ue.status = 'RESERVED'
        AND ue.user_id = v_session.user_id
        AND sd.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40')
      FOR UPDATE OF ue;

      IF v_ent_discount_rec.id IS NULL
         OR v_ent_discount_rec.expires_at <= clock_timestamp()
         OR v_ent_discount_rec.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_STATE_INVALID');
      END IF;
    END IF;
  END IF;

  -- 9. Create confirmed Booking using canonical columns
  v_booking_id := gen_random_uuid();

  INSERT INTO public.bookings (
    id,
    checkout_session_id,
    user_id,
    room_id,
    check_in_at,
    check_out_at,
    check_in,
    check_out,
    guest_count,
    gross_amount_vnd,
    discount_amount_vnd,
    menu_amount_vnd,
    final_paid_amount_vnd,
    payment_status,
    booking_status
  ) VALUES (
    v_booking_id,
    v_session.id,
    v_session.user_id,
    v_session.room_id,
    v_session.check_in_at,
    v_session.check_out_at,
    COALESCE(v_session.check_in, (v_session.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
    COALESCE(v_session.check_out, (v_session.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
    v_session.guest_count,
    v_session.gross_amount_vnd,
    v_session.discount_amount_vnd,
    COALESCE(v_session.menu_amount_vnd, 0),
    p_verified_paid_amount_vnd,
    'paid',
    'confirmed'
  );

  -- 10. Copy checkout menu items to booking menu items snapshot
  INSERT INTO public.booking_menu_items (
    booking_id,
    menu_product_id,
    product_name_snapshot,
    quantity,
    source_type,
    entitlement_id,
    unit_price_vnd,
    total_price_vnd,
    normal_price_vnd,
    reward_source
  )
  SELECT
    v_booking_id,
    cmi.menu_product_id,
    mp.name,
    cmi.quantity,
    cmi.source_type,
    cmi.entitlement_id,
    cmi.unit_price_vnd,
    cmi.total_price_vnd,
    cmi.normal_price_vnd,
    CASE
      WHEN cmi.source_type = 'REWARD' AND sd.milestone_day IS NOT NULL THEN 'Quà Day ' || sd.milestone_day
      WHEN cmi.source_type = 'REWARD' THEN 'Phần thưởng'
      ELSE NULL
    END
  FROM public.checkout_menu_items cmi
  JOIN public.menu_products mp ON mp.id = cmi.menu_product_id
  LEFT JOIN public.user_reward_entitlements ue ON ue.id = cmi.entitlement_id
  LEFT JOIN public.streak_reward_definitions sd ON sd.id = ue.reward_definition_id
  WHERE cmi.checkout_session_id = v_session.id;

  -- 11. Transition reserved voucher / entitlements to USED
  IF v_redemption_id IS NOT NULL THEN
    UPDATE public.voucher_redemptions
    SET status = 'USED',
        booking_id = v_booking_id,
        used_at = clock_timestamp()
    WHERE id = v_redemption_id;
  END IF;

  UPDATE public.user_reward_entitlements
  SET status = 'USED',
      booking_id = v_booking_id,
      used_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE checkout_session_id = v_session.id
    AND status = 'RESERVED';

  -- 12. Append booking_earn to loyalty_transactions ledger (final_paid_amount_vnd * 0.00025)
  v_points_earned := (p_verified_paid_amount_vnd::NUMERIC * 0.00025::NUMERIC);

  IF v_points_earned > 0 THEN
    INSERT INTO public.loyalty_transactions (
      user_id,
      type,
      points_delta,
      booking_id,
      description
    ) VALUES (
      v_session.user_id,
      'booking_earn',
      v_points_earned,
      v_booking_id,
      'Booking earn for confirmed booking ' || v_booking_id::TEXT
    );
  END IF;

  -- 13. Complete checkout session
  UPDATE public.checkout_sessions
  SET status = 'COMPLETED'
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'booking', jsonb_build_object(
      'id', v_booking_id,
      'checkout_session_id', v_session.id,
      'user_id', v_session.user_id,
      'room_id', v_session.room_id,
      'check_in_at', v_session.check_in_at,
      'check_out_at', v_session.check_out_at,
      'check_in', v_session.check_in,
      'check_out', v_session.check_out,
      'guest_count', v_session.guest_count,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', v_session.discount_amount_vnd,
      'menu_amount_vnd', COALESCE(v_session.menu_amount_vnd, 0),
      'final_paid_amount_vnd', p_verified_paid_amount_vnd,
      'payment_status', 'paid',
      'booking_status', 'confirmed',
      'loyalty_points_earned', v_points_earned
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 14. Upgrade: get_staff_dashboard_data (Include itemized menu items)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_dashboard_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_ops JSONB;
    v_tickets JSONB;
    v_today_bookings JSONB;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.staff_roles
        WHERE user_id = v_user_id AND role IN ('staff', 'admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'room_id', r.id,
        'room_name', r.name,
        'operational_status', COALESCE(ro.operational_status, 'ready'),
        'updated_at', ro.updated_at,
        'updated_by', ro.updated_by
    ) ORDER BY r.name ASC), '[]'::jsonb)
    INTO v_room_ops
    FROM public.rooms r
    LEFT JOIN public.room_operations ro ON r.id = ro.room_id
    WHERE r.is_listed = true;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'booking_id', t.booking_id,
        'room_id', t.room_id,
        'room_name', r.name,
        'user_id', t.user_id,
        'guest_name', p.display_name,
        'guest_phone', p.phone,
        'category', t.category,
        'description', t.description,
        'media_paths', to_jsonb(t.media_paths),
        'status', t.status,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_tickets
    FROM public.tickets t
    LEFT JOIN public.rooms r ON t.room_id = r.id
    LEFT JOIN public.profiles p ON t.user_id = p.id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'room_id', b.room_id,
        'room_name', r.name,
        'user_id', b.user_id,
        'guest_name', p.display_name,
        'guest_phone', p.phone,
        'check_in', b.check_in,
        'check_out', b.check_out,
        'check_in_at', b.check_in_at,
        'check_out_at', b.check_out_at,
        'guest_count', b.guest_count,
        'booking_status', b.booking_status,
        'payment_status', b.payment_status,
        'menu_amount_vnd', COALESCE(b.menu_amount_vnd, 0),
        'is_checkin_today', (
            CASE
                WHEN b.check_in_at IS NOT NULL THEN (b.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
                ELSE (b.check_in = v_today)
            END
        ),
        'is_checkout_today', (
            CASE
                WHEN b.check_out_at IS NOT NULL THEN (b.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
                ELSE (b.check_out = v_today)
            END
        ),
        'rewards', (
            SELECT COALESCE(jsonb_agg(reward_desc), '[]'::jsonb)
            FROM (
                SELECT 'Voucher 40% (500 pts)' AS reward_desc
                FROM public.voucher_redemptions vr
                WHERE vr.booking_id = b.id AND vr.status = 'USED'

                UNION ALL

                SELECT
                    CASE
                        WHEN sd.reward_type = 'MEAL_CHOICE' AND ue.selection_data ? 'menu_item_name' THEN
                            'Món ăn: ' || (ue.selection_data->>'menu_item_name')
                        WHEN sd.reward_type = 'DISCOUNT_30' THEN
                            'Voucher 30% applied'
                        WHEN sd.reward_type = 'DISCOUNT_40' THEN
                            'Voucher 40% applied'
                        ELSE
                            sd.title
                    END AS reward_desc
                FROM public.user_reward_entitlements ue
                JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
                WHERE ue.booking_id = b.id AND ue.status = 'USED'
            ) sub
        ),
        'menu_items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', bmi.id,
                'product_name', bmi.product_name_snapshot,
                'quantity', bmi.quantity,
                'source_type', bmi.source_type,
                'unit_price_vnd', bmi.unit_price_vnd,
                'total_price_vnd', bmi.total_price_vnd,
                'normal_price_vnd', bmi.normal_price_vnd,
                'reward_source', bmi.reward_source,
                'reward_label', CASE
                    WHEN bmi.source_type = 'REWARD' AND sd.milestone_day IS NOT NULL THEN 'Quà Day ' || sd.milestone_day
                    WHEN bmi.source_type = 'REWARD' THEN 'Phần thưởng'
                    ELSE NULL
                END
            ) ORDER BY bmi.source_type DESC, bmi.created_at ASC), '[]'::jsonb)
            FROM public.booking_menu_items bmi
            LEFT JOIN public.user_reward_entitlements ue ON ue.id = bmi.entitlement_id
            LEFT JOIN public.streak_reward_definitions sd ON sd.id = ue.reward_definition_id
            WHERE bmi.booking_id = b.id
        )
    ) ORDER BY COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) ASC), '[]'::jsonb)
    INTO v_today_bookings
    FROM public.bookings b
    LEFT JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.profiles p ON b.user_id = p.id
    WHERE (
        (b.check_in_at IS NOT NULL AND (
            (b.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
            OR (b.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
        ))
        OR (b.check_in_at IS NULL AND (b.check_in = v_today OR b.check_out = v_today))
    )
    AND LOWER(b.booking_status) NOT IN ('cancelled', 'refunded');

    RETURN jsonb_build_object(
        'success', true,
        'today', v_today,
        'room_operations', v_room_ops,
        'tickets', v_tickets,
        'today_bookings', v_today_bookings
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 15. Permissions and Security Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_menu_products(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_menu_products(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_menu_products(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_products(TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_checkout_menu_items(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_checkout_menu_items(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_checkout_menu_items(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_checkout_menu_items(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_checkout_menu_items_atomic(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_checkout_menu_items_atomic(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.update_checkout_menu_items_atomic(UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_checkout_menu_items_atomic(UUID, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM anon;
REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_rewards_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_rewards_summary() FROM anon;
REVOKE ALL ON FUNCTION public.get_my_rewards_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rewards_summary() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reserve_checkout_voucher_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_checkout_voucher_atomic(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_checkout_voucher_atomic(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_voucher_atomic(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_checkout_voucher_atomic(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_checkout_voucher_atomic(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.release_checkout_voucher_atomic(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_checkout_voucher_atomic(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reserve_checkout_reward_entitlement_atomic(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_checkout_reward_entitlement_atomic(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_checkout_reward_entitlement_atomic(UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_reward_entitlement_atomic(UUID, UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_checkout_reward_entitlement_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_checkout_reward_entitlement_atomic(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.release_checkout_reward_entitlement_atomic(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_checkout_reward_entitlement_atomic(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM anon;
REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_data() TO authenticated, service_role;
