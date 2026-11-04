-- Additive application data; identical migration source for local and cloud.
create table if not exists public.catalog_versions (
 name text primary key, version text not null, updated_at timestamptz not null default now()
);
create table if not exists public.travel_external_cache (
 cache_key text primary key, body jsonb not null, expires_at timestamptz not null, modified text
);
create index if not exists travel_external_cache_expiry_idx on public.travel_external_cache(expires_at);
create table if not exists public.external_service_limits (
 name text primary key, next_allowed_at timestamptz not null
);
alter table public.catalog_versions enable row level security;
alter table public.travel_external_cache enable row level security;
alter table public.external_service_limits enable row level security;
revoke all on public.catalog_versions, public.travel_external_cache, public.external_service_limits from public;
alter table public.places add column if not exists google_place_id text;
alter table public.place_catalog add column if not exists google_place_id text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('ha-noi','{"en":"Hanoi","vi":"Hà Nội"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',21.0278,105.8342,true,'northern-vietnam',array['capital','culture','history','food','city-break']::text[],array['Ha Noi','Hà Nội','Thủ đô']::text[],'ha-noi hanoi hà nội ha noi hà nội thủ đô')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('ho-chi-minh-city','{"en":"Ho Chi Minh City","vi":"Thành phố Hồ Chí Minh"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.7769,106.7009,true,'southern-vietnam',array['city-break','food','nightlife','history','business']::text[],array['Saigon','Sài Gòn','TP.HCM','HCMC']::text[],'ho-chi-minh-city ho chi minh city thành phố hồ chí minh saigon sài gòn tp.hcm hcmc')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('da-nang','{"en":"Da Nang","vi":"Đà Nẵng"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',16.0544,108.2022,true,'central-vietnam',array['beach','city-break','family','food','nature']::text[],array['Danang','Đà Nẵng']::text[],'da-nang da nang đà nẵng danang đà nẵng')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('hoi-an','{"en":"Hoi An","vi":"Hội An"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',15.8801,108.338,true,'central-vietnam',array['heritage','culture','food','romantic','walking']::text[],array['Hoi An Ancient Town','Phố cổ Hội An']::text[],'hoi-an hoi an hội an hoi an ancient town phố cổ hội an')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('hue','{"en":"Hue","vi":"Huế"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',16.4637,107.5909,true,'central-vietnam',array['heritage','culture','history','food','river']::text[],array['Imperial City Hue','Cố đô Huế']::text[],'hue hue huế imperial city hue cố đô huế')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('nha-trang','{"en":"Nha Trang","vi":"Nha Trang"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',12.2388,109.1967,true,'south-central-coast',array['beach','island','diving','family','seafood']::text[],array['Khanh Hoa','Khánh Hòa']::text[],'nha-trang nha trang nha trang khanh hoa khánh hòa')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('da-lat','{"en":"Da Lat","vi":"Đà Lạt"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',11.9404,108.4583,true,'central-highlands',array['mountain','romantic','nature','coffee','cool-weather']::text[],array['Dalat','Đà Lạt']::text[],'da-lat da lat đà lạt dalat đà lạt')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('phu-quoc','{"en":"Phu Quoc","vi":"Phú Quốc"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.2899,103.984,true,'southern-vietnam',array['island','beach','resort','seafood','family']::text[],array['Phu Quoc Island','Đảo Phú Quốc']::text[],'phu-quoc phu quoc phú quốc phu quoc island đảo phú quốc')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('sa-pa','{"en":"Sa Pa","vi":"Sa Pa"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',22.3364,103.8438,true,'northern-vietnam',array['mountain','trekking','culture','rice-terraces','nature']::text[],array['Sapa','Sa Pa']::text[],'sa-pa sa pa sa pa sapa sa pa')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('ha-long','{"en":"Ha Long","vi":"Hạ Long"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',20.9712,107.0448,true,'northern-vietnam',array['bay','cruise','nature','island','family']::text[],array['Ha Long Bay','Vịnh Hạ Long']::text[],'ha-long ha long hạ long ha long bay vịnh hạ long')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('ninh-binh','{"en":"Ninh Binh","vi":"Ninh Bình"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',20.2506,105.9745,true,'northern-vietnam',array['nature','heritage','boat','karst','culture']::text[],array['Trang An','Tràng An','Tam Cốc']::text[],'ninh-binh ninh binh ninh bình trang an tràng an tam cốc')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('ha-giang','{"en":"Ha Giang","vi":"Hà Giang"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',22.8026,104.9784,true,'northern-vietnam',array['mountain','motorbike','adventure','culture','nature']::text[],array['Dong Van','Đồng Văn','Mã Pì Lèng']::text[],'ha-giang ha giang hà giang dong van đồng văn mã pì lèng')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('can-tho','{"en":"Can Tho","vi":"Cần Thơ"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.0452,105.7469,true,'mekong-delta',array['mekong','river','food','floating-market','culture']::text[],array['Cai Rang','Cái Răng']::text[],'can-tho can tho cần thơ cai rang cái răng')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('phong-nha','{"en":"Phong Nha","vi":"Phong Nha"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',17.6103,106.3145,true,'central-vietnam',array['cave','adventure','nature','national-park','trekking']::text[],array['Phong Nha-Ke Bang','Phong Nha Kẻ Bàng','Quang Binh']::text[],'phong-nha phong nha phong nha phong nha-ke bang phong nha kẻ bàng quang binh')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('quy-nhon','{"en":"Quy Nhon","vi":"Quy Nhơn"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',13.782,109.219,true,'south-central-coast',array['beach','seafood','heritage','relax','coast']::text[],array['Binh Dinh','Bình Định']::text[],'quy-nhon quy nhon quy nhơn binh dinh bình định')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('mui-ne','{"en":"Mui Ne","vi":"Mũi Né"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.9333,108.2833,true,'south-central-coast',array['beach','sand-dunes','kitesurfing','seafood','sunset']::text[],array['Phan Thiet','Phan Thiết','Mũi Né']::text[],'mui-ne mui ne mũi né phan thiet phan thiết mũi né')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('vung-tau','{"en":"Vung Tau","vi":"Vũng Tàu"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.4114,107.1362,true,'southern-vietnam',array['beach','weekend','seafood','city-break','family']::text[],array['Ba Ria Vung Tau','Bà Rịa Vũng Tàu']::text[],'vung-tau vung tau vũng tàu ba ria vung tau bà rịa vũng tàu')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('hai-phong','{"en":"Hai Phong","vi":"Hải Phòng"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',20.8449,106.6881,false,'northern-vietnam',array['port-city','food','gateway','city-break','coast']::text[],array['Hải Phòng']::text[],'hai-phong hai phong hải phòng hải phòng')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('cat-ba','{"en":"Cat Ba","vi":"Cát Bà"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',20.7278,107.0482,false,'northern-vietnam',array['island','beach','national-park','kayaking','nature']::text[],array['Cat Ba Island','Đảo Cát Bà']::text[],'cat-ba cat ba cát bà cat ba island đảo cát bà')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('mai-chau','{"en":"Mai Chau","vi":"Mai Châu"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',20.6628,105.0825,false,'northern-vietnam',array['mountain','culture','homestay','cycling','rice-fields']::text[],array['Mai Châu']::text[],'mai-chau mai chau mai châu mai châu')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('moc-chau','{"en":"Moc Chau","vi":"Mộc Châu"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',20.8297,104.728,false,'northern-vietnam',array['mountain','tea-hills','flowers','nature','cool-weather']::text[],array['Mộc Châu']::text[],'moc-chau moc chau mộc châu mộc châu')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('tam-dao','{"en":"Tam Dao","vi":"Tam Đảo"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',21.4568,105.6431,false,'northern-vietnam',array['mountain','weekend','cool-weather','nature','relax']::text[],array['Tam Đảo']::text[],'tam-dao tam dao tam đảo tam đảo')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('cao-bang','{"en":"Cao Bang","vi":"Cao Bằng"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',22.6666,106.2639,false,'northern-vietnam',array['waterfall','mountain','nature','culture','adventure']::text[],array['Ban Gioc','Bản Giốc']::text[],'cao-bang cao bang cao bằng ban gioc bản giốc')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('dien-bien-phu','{"en":"Dien Bien Phu","vi":"Điện Biên Phủ"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',21.386,103.023,false,'northern-vietnam',array['history','mountain','culture','museum','heritage']::text[],array['Dien Bien','Điện Biên']::text[],'dien-bien-phu dien bien phu điện biên phủ dien bien điện biên')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('bac-ha','{"en":"Bac Ha","vi":"Bắc Hà"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',22.5431,104.2907,false,'northern-vietnam',array['market','mountain','culture','ethnic-villages','weekend']::text[],array['Bắc Hà']::text[],'bac-ha bac ha bắc hà bắc hà')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('thanh-hoa','{"en":"Thanh Hoa","vi":"Thanh Hóa"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',19.8067,105.7852,false,'north-central-coast',array['beach','history','food','family','weekend']::text[],array['Sam Son','Sầm Sơn']::text[],'thanh-hoa thanh hoa thanh hóa sam son sầm sơn')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('vinh','{"en":"Vinh","vi":"Vinh"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',18.6796,105.6813,false,'north-central-coast',array['city-break','history','food','gateway','culture']::text[],array['Nghe An','Nghệ An']::text[],'vinh vinh vinh nghe an nghệ an')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('dong-hoi','{"en":"Dong Hoi","vi":"Đồng Hới"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',17.4689,106.6223,false,'central-vietnam',array['beach','cave-gateway','seafood','relax','nature']::text[],array['Quang Binh','Quảng Bình']::text[],'dong-hoi dong hoi đồng hới quang binh quảng bình')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('tuy-hoa','{"en":"Tuy Hoa","vi":"Tuy Hòa"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',13.0955,109.3209,false,'south-central-coast',array['beach','coast','seafood','sunrise','relax']::text[],array['Phu Yen','Phú Yên']::text[],'tuy-hoa tuy hoa tuy hòa phu yen phú yên')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('cam-ranh','{"en":"Cam Ranh","vi":"Cam Ranh"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',11.9214,109.1591,false,'south-central-coast',array['beach','resort','airport-gateway','seafood','family']::text[],array['Cam Ranh Bay','Vịnh Cam Ranh']::text[],'cam-ranh cam ranh cam ranh cam ranh bay vịnh cam ranh')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('con-dao','{"en":"Con Dao","vi":"Côn Đảo"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',8.6864,106.6082,false,'southern-vietnam',array['island','beach','history','diving','nature']::text[],array['Con Son','Côn Sơn']::text[],'con-dao con dao côn đảo con son côn sơn')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('buon-ma-thuot','{"en":"Buon Ma Thuot","vi":"Buôn Ma Thuột"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',12.6662,108.0382,false,'central-highlands',array['coffee','waterfall','culture','nature','highlands']::text[],array['Dak Lak','Đắk Lắk']::text[],'buon-ma-thuot buon ma thuot buôn ma thuột dak lak đắk lắk')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('pleiku','{"en":"Pleiku","vi":"Pleiku"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',13.9833,108,false,'central-highlands',array['highlands','coffee','nature','culture','lake']::text[],array['Gia Lai','Biển Hồ']::text[],'pleiku pleiku pleiku gia lai biển hồ')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('kon-tum','{"en":"Kon Tum","vi":"Kon Tum"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',14.3545,108.0076,false,'central-highlands',array['culture','highlands','architecture','nature','history']::text[],array['Kon Tum Wooden Church','Nhà thờ gỗ Kon Tum']::text[],'kon-tum kon tum kon tum kon tum wooden church nhà thờ gỗ kon tum')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('tay-ninh','{"en":"Tay Ninh","vi":"Tây Ninh"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',11.3352,106.1099,false,'southern-vietnam',array['mountain','temple','culture','day-trip','food']::text[],array['Ba Den Mountain','Núi Bà Đen']::text[],'tay-ninh tay ninh tây ninh ba den mountain núi bà đen')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('my-tho','{"en":"My Tho","vi":"Mỹ Tho"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.3601,106.3596,false,'mekong-delta',array['mekong','river','day-trip','food','boat']::text[],array['Tien Giang','Tiền Giang']::text[],'my-tho my tho mỹ tho tien giang tiền giang')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('ben-tre','{"en":"Ben Tre","vi":"Bến Tre"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.2434,106.3756,false,'mekong-delta',array['mekong','coconut','river','cycling','homestay']::text[],array['Bến Tre']::text[],'ben-tre ben tre bến tre bến tre')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('chau-doc','{"en":"Chau Doc","vi":"Châu Đốc"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.7008,105.1167,false,'mekong-delta',array['river','temple','culture','food','border']::text[],array['Sam Mountain','Núi Sam']::text[],'chau-doc chau doc châu đốc sam mountain núi sam')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('long-xuyen','{"en":"Long Xuyen","vi":"Long Xuyên"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.3864,105.4352,false,'mekong-delta',array['mekong','food','floating-market','river','local-life']::text[],array['An Giang','Long Xuyên']::text[],'long-xuyen long xuyen long xuyên an giang long xuyên')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('rach-gia','{"en":"Rach Gia","vi":"Rạch Giá"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',10.0125,105.0809,false,'mekong-delta',array['coast','gateway','seafood','island-transfer','local-life']::text[],array['Kien Giang','Kiên Giang']::text[],'rach-gia rach gia rạch giá kien giang kiên giang')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('tra-vinh','{"en":"Tra Vinh","vi":"Trà Vinh"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',9.9347,106.3453,false,'mekong-delta',array['culture','temples','mekong','food','local-life']::text[],array['Trà Vinh']::text[],'tra-vinh tra vinh trà vinh trà vinh')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('soc-trang','{"en":"Soc Trang","vi":"Sóc Trăng"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',9.6025,105.9739,false,'mekong-delta',array['culture','temples','food','mekong','local-life']::text[],array['Sóc Trăng']::text[],'soc-trang soc trang sóc trăng sóc trăng')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('bac-lieu','{"en":"Bac Lieu","vi":"Bạc Liêu"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',9.294,105.7278,false,'mekong-delta',array['coast','culture','food','history','wind-farm']::text[],array['Bạc Liêu']::text[],'bac-lieu bac lieu bạc liêu bạc liêu')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.cities(slug,name,country,timezone,currency,lat,lon,popular,region,tags,aliases,search_text)
values('ca-mau','{"en":"Ca Mau","vi":"Cà Mau"}'::jsonb,'VN','Asia/Ho_Chi_Minh','VND',9.1769,105.1524,false,'mekong-delta',array['mangrove','nature','coast','food','southernmost']::text[],array['Dat Mui','Đất Mũi']::text[],'ca-mau ca mau cà mau dat mui đất mũi')
on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=excluded.aliases,search_text=excluded.search_text;
insert into public.catalog_versions(name,version) values('vietnam-cities','2026-11-03.1') on conflict(name) do update set version=excluded.version,updated_at=now();
