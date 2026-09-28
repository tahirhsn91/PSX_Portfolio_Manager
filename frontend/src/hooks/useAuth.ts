/**
 * Account hooks. The signed-in user lives in the query cache under one key, so a
 * sign-in, a profile edit and a password change all update the same place the
 * route guard is watching.
 *
 * `useMe` deliberately does not retry: a 401 is the ordinary "nobody is signed in"
 * answer, and retrying it twice (the app-wide default) would delay the redirect to
 * the sign-in page by seconds on every cold load.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, type ProfilePatch } from '@/services';
import type { AuthUser } from '@/types';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export function useMe() {
  return useQuery<AuthUser | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => authApi.me(),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (user) => queryClient.setQueryData(AUTH_QUERY_KEY, user),
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      password,
      displayName,
    }: {
      email: string;
      password: string;
      displayName: string;
    }) => authApi.signup(email, password, displayName),
    onSuccess: (user) => queryClient.setQueryData(AUTH_QUERY_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    // Whatever was cached belonged to the account that just left; clearing is the
    // difference between signing out and merely hiding the data.
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.clear();
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => authApi.updateProfile(patch),
    onSuccess: (user) => queryClient.setQueryData(AUTH_QUERY_KEY, user),
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => authApi.changePassword(currentPassword, newPassword),
    // The password change keeps *this* session and clears `mustChangePassword`, so
    // re-read the account rather than assuming the rest of it is unchanged.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY }),
  });
}
