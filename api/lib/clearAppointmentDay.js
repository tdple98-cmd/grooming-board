/** Remove all appointments on one Melbourne calendar day; drop dogs with no remaining appointments. */
export async function clearAppointmentsOnDate(supabase, dateStr) {
  const date = String(dateStr).slice(0, 10);

  const { data: appts, error } = await supabase
    .from("appointments")
    .select("id, dog_id")
    .eq("appointment_date", date);

  if (error) throw error;
  if (!appts?.length) return { date, removedAppointments: 0, removedDogs: 0 };

  const ids = appts.map((a) => a.id);
  const { error: delErr } = await supabase.from("appointments").delete().in("id", ids);
  if (delErr) throw delErr;

  const dogIds = [...new Set(appts.map((a) => a.dog_id).filter(Boolean))];
  let removedDogs = 0;
  for (const dogId of dogIds) {
    const { count } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("dog_id", dogId);
    if (count === 0) {
      await supabase.from("dogs").delete().eq("id", dogId);
      removedDogs++;
    }
  }

  return { date, removedAppointments: appts.length, removedDogs };
}

export async function getLastAppointmentDate(supabase) {
  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_date")
    .order("appointment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.appointment_date) return null;
  return String(data.appointment_date).slice(0, 10);
}
