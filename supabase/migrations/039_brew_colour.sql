-- A beer's own colour on its tank, chosen by hand. Null = use the style's colour.
alter table brews add column if not exists colour text check (colour is null or colour ~ '^#[0-9A-Fa-f]{6}$');
