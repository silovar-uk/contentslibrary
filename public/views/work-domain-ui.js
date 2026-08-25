import { $, $$ } from "../core/dom.js";
import { WORK_TYPE_OPTIONS, WORK_STATUS_OPTIONS, optionMarkup } from "../shared/work-domain.js";

function replaceOptions(select, options, { includeBlank = false } = {}) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = optionMarkup(options, { includeBlank });
  if (Array.from(select.options).some((option) => option.value === current)) select.value = current;
}

export function initWorkDomainUi() {
  replaceOptions($("#filterType"), WORK_TYPE_OPTIONS, { includeBlank: true });
  replaceOptions($("#filterStatus"), WORK_STATUS_OPTIONS, { includeBlank: true });

  $$("#workForm select[name='type']").forEach((select) => replaceOptions(select, WORK_TYPE_OPTIONS));
  $$("#workForm select[name='status']").forEach((select) => replaceOptions(select, WORK_STATUS_OPTIONS));
}
