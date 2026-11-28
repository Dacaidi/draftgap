import { displayNameByRole, Role } from "@draftgap/core/src/models/Role";
import { RoleIcon } from "../icons/roles/RoleIcon";

export function RoleCell(props: { role: Role }) {
    return (
        <div class="flex items-center justify-center">
            <RoleIcon role={props.role} class="h-8" aria-hidden="true" />
            <span class="sr-only">{displayNameByRole[props.role]}</span>
        </div>
    );
}
