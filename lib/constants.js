// Colors
export const C = {
  cream: "#F4EFE7", paper: "#FCFAF6", brown: "#2A2420", ink: "#3D362F",
  gold: "#B8956A", goldDeep: "#9C7B52", line: "#E7DECF",
  green: "#5E7C5A", amber: "#C68A3E", slate: "#9A9087", rose: "#C98B7A", blue: "#6E8299",
};

// Dog workflow steps
export const STEPS = [
  { key: "booked", label: "Not arrived", color: C.slate, dot: "#B4ACA2" },
  { key: "checkedin", label: "Checked in", color: C.blue, dot: C.blue },
  { key: "grooming", label: "Grooming", color: C.amber, dot: C.amber },
  { key: "ready", label: "Ready", color: C.green, dot: C.green },
  { key: "noshow", label: "No-show", color: C.rose, dot: C.rose },
];

export const stepOf = (k) => STEPS.find((s) => s.key === k) || STEPS[0];

export const GROOMERS = ["Thanh", "Wendy", "Trang", "Michelle", "Lynn", "Sandy", "Fei", "Claire"];

export const TABS = [
  { k: "today", l: "Today" },
  { k: "specs", l: "Groom Specs" },
  { k: "checkin", l: "Check-in" },
  { k: "pickup", l: "Pickup" },
];

export const TAGS = [
  { key: "cut", label: "Cut", hint: "Today's change to the cut", color: C.gold },
  { key: "watch", label: "Watch", hint: "Anything to be careful of", color: C.rose },
  { key: "svc", label: "Service", hint: "Add-on or change", color: C.green },
];

export const SPECS = [
  { key: "cut", label: "Usual cut / style" },
  { key: "coat", label: "Coat type" },
  { key: "temperament", label: "Temperament" },
  { key: "health", label: "Health / allergy" },
];

export const FLAG_FIELD = {
  key: "flag",
  label: "Flag for next time",
  hint: "Tap chips or type — saved for next visit",
  color: C.amber,
};
