-- HO Synergy League 2026 - chạy toàn bộ file này trong Supabase > SQL Editor

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Cầu thủ',
  bd date,
  avatar text,
  team int check (team between 0 and 5),
  num int check (num between 0 and 99),
  cancel boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz default now()
);
create unique index profiles_team_num on public.profiles(team, num) where team is not null;

create table public.matches (
  id text primary key,
  round int not null,
  home int not null,
  away int not null,
  match_date date not null,
  hg int,
  ag int
);
create table public.events (
  id bigserial primary key,
  match_id text not null references public.matches(id) on delete cascade,
  type text not null check (type in ('g','y','r')),
  team int not null,
  player text not null
);
create table public.news (
  id bigserial primary key,
  content text not null,
  created_at timestamptz default now()
);
create table public.team_avatars (team int primary key, img text not null);
create table public.settings (key text primary key, value text);
create table public.predictions (
  user_id uuid references auth.users(id) on delete cascade,
  match_id text references public.matches(id) on delete cascade,
  winner text check (winner in ('h','d','a')),
  pred_home int,
  pred_away int,
  primary key (user_id, match_id)
);

-- Tạo hồ sơ khi có người đăng ký tài khoản
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Đăng ký đội / hủy / duyệt hủy (chạy bằng RPC để kiểm soát quy tắc)
create function public.register_team(t int, n int, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  if exists (select 1 from profiles where id = auth.uid() and team is not null) then
    raise exception 'Bạn đã đăng ký một đội. Hãy hủy đăng ký trước.';
  end if;
  if exists (select 1 from profiles where team = t and num = n) then
    raise exception 'Số áo này đã có người dùng';
  end if;
  update profiles set team = t, num = n, cancel = false,
    name = coalesce(nullif(p_name,''), name) where id = auth.uid();
end $$;

create function public.request_cancel() returns void
language sql security definer set search_path = public as $$
  update profiles set cancel = true where id = auth.uid() and team is not null;
$$;

create function public.approve_cancel(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Chỉ admin'; end if;
  update profiles set team = null, num = null, cancel = false where id = uid;
end $$;

-- Bảo mật (RLS)
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.events enable row level security;
alter table public.news enable row level security;
alter table public.team_avatars enable row level security;
alter table public.settings enable row level security;
alter table public.predictions enable row level security;

create policy "đọc" on public.profiles for select using (true);
create policy "sửa hồ sơ mình" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "admin sửa avatar mọi người" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
-- người dùng chỉ được sửa 3 cột này; team/num/cancel/is_admin chỉ đổi qua hàm RPC
revoke update on public.profiles from anon, authenticated;
grant update (name, bd, avatar) on public.profiles to authenticated;

create policy "đọc" on public.matches for select using (true);
create policy "admin" on public.matches for update using (public.is_admin()) with check (public.is_admin());
create policy "đọc" on public.events for select using (true);
create policy "admin" on public.events for all using (public.is_admin()) with check (public.is_admin());
create policy "đọc" on public.news for select using (true);
create policy "admin" on public.news for all using (public.is_admin()) with check (public.is_admin());
create policy "đọc" on public.team_avatars for select using (true);
create policy "admin" on public.team_avatars for all using (public.is_admin()) with check (public.is_admin());
create policy "đọc" on public.settings for select using (true);
create policy "admin" on public.settings for all using (public.is_admin()) with check (public.is_admin());
create policy "dự đoán của mình" on public.predictions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Dữ liệu lịch đấu (0 Mượt mà, 1 Hài vãi, 2 Phòng kính, 3 VPS United, 4 Platform, 5 Lá chắn)
insert into public.matches (id, round, home, away, match_date, hg, ag) values
('r1m1',1,0,5,'2026-10-27',3,0),
('r1m2',1,1,4,'2026-10-27',2,0),
('r1m3',1,2,3,'2026-10-27',2,1),
('r2m1',2,0,4,'2026-11-03',null,null),
('r2m2',2,5,3,'2026-11-03',null,null),
('r2m3',2,1,2,'2026-11-03',null,null),
('r3m1',3,0,3,'2026-11-10',null,null),
('r3m2',3,4,2,'2026-11-10',null,null),
('r3m3',3,5,1,'2026-11-10',null,null),
('r4m1',4,0,2,'2026-11-17',null,null),
('r4m2',4,3,1,'2026-11-17',null,null),
('r4m3',4,4,5,'2026-11-17',null,null),
('r5m1',5,0,1,'2026-11-24',null,null),
('r5m2',5,2,5,'2026-11-24',null,null),
('r5m3',5,3,4,'2026-11-24',null,null);
