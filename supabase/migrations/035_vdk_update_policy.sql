-- Lets a brewer correct a VDK result that was logged wrongly
create policy "brewer update vdk" on vdk_readings
  for update to authenticated
  using ((select get_my_role()) in ('admin', 'brewer'))
  with check ((select get_my_role()) in ('admin', 'brewer'));
