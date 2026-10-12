-- Paper packaging reports record part cartons and part kegs (47.5 cartons, 15.2 at venue).
alter table packaging_runs alter column qty type numeric using qty::numeric;
alter table packaging_reports
  alter column stock_venue_kegs type numeric, alter column stock_venue_cartons type numeric,
  alter column stock_options_kegs type numeric, alter column stock_options_cartons type numeric,
  alter column stock_sales_kegs type numeric, alter column stock_sales_cartons type numeric;
