import { Loader2, Search, Shield, ShieldOff, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card } from "@/client/components";
import { useToast } from "@/client/components/Toast";
import { useAuth } from "@/client/contexts/AuthContext";
import { api } from "@/client/lib/api";
import { cn, formatDate } from "@/client/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

interface AdminStats {
  totalUsers: number;
  adminCount: number;
}

export function AdminPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    const { data } = await api.api.admin.stats.get();
    if (data?.stats) {
      setStats(data.stats);
    }
  }, []);

  const fetchUsers = useCallback(async (pageNum = 1, searchQuery = "") => {
    setLoading(true);
    try {
      const { data } = await api.api.admin.users.get({
        query: {
          page: String(pageNum),
          search: searchQuery || undefined,
        },
      });
      if (data) {
        setUsers(data.users as AdminUser[]);
        setTotalPages(data.totalPages);
        setPage(data.page);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchUsers();
  }, [fetchStats, fetchUsers]);

  const handleSearch = () => {
    fetchUsers(1, search);
  };

  const handleToggleRole = async (user: AdminUser) => {
    const newRole = user.role === "ADMIN" ? "USER" : "ADMIN";
    const { data, error } = await api.api.admin
      .users({ id: user.id })
      .role.patch({
        role: newRole,
      });

    if (error) {
      showToast(t("admin.roleUpdateFailed", "Failed to update role"), "error");
      return;
    }

    if (data?.user) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, role: data.user.role } : u,
        ),
      );
      showToast(
        t("admin.roleUpdated", "Role updated to {{role}}", {
          role: newRole,
        }),
        "success",
      );
      fetchStats();
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="font-bold text-2xl text-text-primary">
        {t("admin.title", "Admin Panel")}
      </h1>

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="flex items-center gap-4">
            <div className="rounded-lg bg-accent/10 p-3">
              <Users className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="font-bold text-2xl text-text-primary">
                {stats.totalUsers}
              </p>
              <p className="text-sm text-text-secondary">
                {t("admin.totalUsers", "Total Users")}
              </p>
            </div>
          </Card>
          <Card className="flex items-center gap-4">
            <div className="rounded-lg bg-amber-500/10 p-3">
              <Shield className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="font-bold text-2xl text-text-primary">
                {stats.adminCount}
              </p>
              <p className="text-sm text-text-secondary">
                {t("admin.admins", "Admins")}
              </p>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={t("admin.searchUsers", "Search users by email...")}
              className="w-full rounded-lg border border-border bg-bg-tertiary py-2 pr-4 pl-10 text-text-primary placeholder-text-placeholder focus:border-border-focus focus:outline-none"
            />
          </div>
          <Button size="sm" onClick={handleSearch}>
            {t("common.search", "Search")}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-text-secondary" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border border-b text-left">
                    <th className="px-2 py-3 font-medium text-text-secondary">
                      {t("admin.email", "Email")}
                    </th>
                    <th className="px-2 py-3 font-medium text-text-secondary">
                      {t("admin.name", "Name")}
                    </th>
                    <th className="px-2 py-3 font-medium text-text-secondary">
                      {t("admin.role", "Role")}
                    </th>
                    <th className="px-2 py-3 font-medium text-text-secondary">
                      {t("admin.createdAt", "Created")}
                    </th>
                    <th className="px-2 py-3 font-medium text-text-secondary">
                      {t("admin.lastLogin", "Last Login")}
                    </th>
                    <th className="px-2 py-3 font-medium text-text-secondary">
                      {t("admin.actions", "Actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-border/50 border-b hover:bg-bg-tertiary/50"
                    >
                      <td className="px-2 py-3 text-text-primary">
                        {user.email}
                      </td>
                      <td className="px-2 py-3 text-text-secondary">
                        {user.name || "-"}
                      </td>
                      <td className="px-2 py-3">
                        <Badge
                          variant={
                            user.role === "ADMIN" ? "warning" : "secondary"
                          }
                        >
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-2 py-3 text-text-secondary">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-2 py-3 text-text-secondary">
                        {formatDate(user.lastLoginAt)}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleRole(user)}
                          disabled={
                            user.id === currentUser?.id && user.role === "ADMIN"
                          }
                          className={cn(
                            "inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-medium text-xs transition-colors",
                            {
                              "bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary":
                                !(
                                  user.id === currentUser?.id &&
                                  user.role === "ADMIN"
                                ),
                              "cursor-not-allowed bg-bg-tertiary text-text-muted opacity-50":
                                user.id === currentUser?.id &&
                                user.role === "ADMIN",
                            },
                          )}
                          title={
                            user.id === currentUser?.id && user.role === "ADMIN"
                              ? t(
                                  "admin.cannotDemoteSelf",
                                  "Cannot demote yourself",
                                )
                              : user.role === "ADMIN"
                                ? t("admin.demote", "Demote to User")
                                : t("admin.promote", "Promote to Admin")
                          }
                        >
                          {user.role === "ADMIN" ? (
                            <>
                              <ShieldOff className="h-3 w-3" />
                              {t("admin.demote", "Demote")}
                            </>
                          ) : (
                            <>
                              <Shield className="h-3 w-3" />
                              {t("admin.promote", "Promote")}
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => fetchUsers(page - 1, search)}
                >
                  {t("common.previous", "Previous")}
                </Button>
                <span className="flex items-center px-3 text-sm text-text-secondary">
                  {t("common.pageOf", "{{page}} of {{total}}", {
                    page,
                    total: totalPages,
                  })}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => fetchUsers(page + 1, search)}
                >
                  {t("common.next", "Next")}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
