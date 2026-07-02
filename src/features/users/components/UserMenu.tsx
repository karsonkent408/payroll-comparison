import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, User, Sun, Moon, Monitor } from "lucide-react";
import { authClient } from "@/shared/lib/auth-client";
import { Avatar, AvatarImage, AvatarFallback } from "@/shared/components/ui/avatar";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import { Separator } from "@/shared/components/ui/separator";
import { useTheme } from "@/shared/lib/theme";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const { theme, setTheme } = useTheme();
  const user = session?.user ?? null;

  if (!user) return null;

  async function handleLogout() {
    setOpen(false);
    await authClient.signOut();
    navigate({ to: "/login" });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="User menu"
          className="fixed top-4 right-4 z-50 rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar>
            {user.image && <AvatarImage src={user.image} alt={user.name} />}
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0">
        <div className="px-3 py-3">
          <p className="text-sm font-medium leading-none">{user.name}</p>
          <p className="mt-1 text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <Separator />
        <div className="px-3 py-2">
          <p className="mb-1.5 text-xs text-muted-foreground">Theme</p>
          <div className="flex rounded-md border border-border overflow-hidden">
            {([
              { value: "light", icon: Sun, label: "Light" },
              { value: "dark", icon: Moon, label: "Dark" },
              { value: "system", icon: Monitor, label: "System" },
            ] as const).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                onClick={() => setTheme(value)}
                className={`flex flex-1 items-center justify-center gap-1 py-1 text-xs transition-colors ${
                  theme === value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <Separator />
        <div className="p-1">
          { user.role === 'admin' && 
          <button
          type="button"
          onClick={() => { setOpen(false); navigate({ to: '/admin/users' }); }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <User className="h-3.5 w-3.5" />
            Manage Users
          </button>
          }
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
