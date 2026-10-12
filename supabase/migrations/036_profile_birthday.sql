-- Each person's birthday as MM-DD (no year), for the greeting on the Cellar page.
alter table profiles add column if not exists birthday text check (birthday is null or birthday ~ '^[0-9]{2}-[0-9]{2}$');
