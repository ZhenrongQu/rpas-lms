import SwiftUI

struct AccountView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var showDeleteConfirm = false
    @State private var deleting = false
    @State private var deleteError: String?

    private let api = APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)

    var body: some View {
        NavigationView {
            List {
                if case .signedIn(let user) = auth.state {
                    Section(header: Text("Profile")) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(user.name ?? "Pilot")
                                .font(.headline)
                                .foregroundColor(AppTheme.ink)
                            if let email = user.email {
                                Text(email)
                                    .font(.subheadline)
                                    .foregroundColor(AppTheme.secondaryInk)
                            }
                        }
                        .padding(.vertical, 4)

                        HStack {
                            Text("Access")
                                .foregroundColor(AppTheme.ink)
                            Spacer()
                            Text(tierLabel(user.accessTier))
                                .foregroundColor(AppTheme.secondaryInk)
                        }
                    }
                }

                Section(header: Text("Security")) {
                    NavigationLink {
                        ChangePasswordView()
                    } label: {
                        Label("Change password", systemImage: "lock.rotation")
                    }
                }

                Section(header: Text("Manage on the web")) {
                    Link(destination: URL(string: "https://pacificdrone.ca/en/billing")!) {
                        Label("Subscription & billing", systemImage: "creditcard")
                    }
                }

                Section {
                    Button {
                        Task { await auth.signOut() }
                    } label: {
                        Text("Sign Out")
                            .foregroundColor(.red)
                    }
                }

                Section(footer: deleteFooter) {
                    Button {
                        showDeleteConfirm = true
                    } label: {
                        Text(deleting ? "Deleting…" : "Delete account")
                            .foregroundColor(.red)
                    }
                    .disabled(deleting)
                }
            }
            .navigationTitle("Account")
            .alert(isPresented: $showDeleteConfirm) {
                Alert(
                    title: Text("Delete account?"),
                    message: Text("This permanently deletes your account and all your data. This cannot be undone."),
                    primaryButton: .destructive(Text("Delete")) {
                        Task { await deleteAccount() }
                    },
                    secondaryButton: .cancel()
                )
            }
        }
    }

    @ViewBuilder
    private var deleteFooter: some View {
        if let deleteError = deleteError {
            Text(deleteError).foregroundColor(.red)
        } else {
            Text("Permanently deletes your account and all associated data.")
        }
    }

    private func deleteAccount() async {
        guard let token = auth.token, !deleting else { return }
        deleting = true
        deleteError = nil
        do {
            let _: OKResponse = try await api.send(
                path: "/api/mobile/account",
                method: "DELETE",
                token: token
            )
            // Account gone — sign out drops back to the login screen.
            await auth.signOut()
        } catch {
            deleteError = "Couldn't delete your account. Please try again."
            deleting = false
        }
    }

    private func tierLabel(_ tier: String) -> String {
        tier == "PAID" ? "Full access" : "Free plan"
    }
}

private struct ChangePasswordRequest: Encodable {
    let oldPassword: String
    let newPassword: String
}

/// Native change-password flow → POST /api/mobile/account/password.
struct ChangePasswordView: View {
    @EnvironmentObject var auth: AuthViewModel
    @Environment(\.presentationMode) private var presentationMode

    @State private var current = ""
    @State private var newPassword = ""
    @State private var confirm = ""
    @State private var submitting = false
    @State private var errorMessage: String?
    @State private var didSucceed = false

    private let api = APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)

    private var canSubmit: Bool {
        !current.isEmpty && newPassword.count >= 8 && newPassword == confirm && !submitting
    }

    var body: some View {
        Form {
            Section(footer: Text("New password must be at least 8 characters.")) {
                SecureField("Current password", text: $current)
                    .foregroundColor(AppTheme.ink)
                SecureField("New password", text: $newPassword)
                    .foregroundColor(AppTheme.ink)
                SecureField("Confirm new password", text: $confirm)
                    .foregroundColor(AppTheme.ink)
            }

            if newPassword.isEmpty == false, confirm.isEmpty == false, newPassword != confirm {
                Text("New passwords don't match.")
                    .font(.footnote)
                    .foregroundColor(.red)
            }

            if let errorMessage = errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundColor(.red)
            }

            if didSucceed {
                Label("Password updated", systemImage: "checkmark.circle.fill")
                    .foregroundColor(AppTheme.green)
            }

            Section {
                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        Spacer()
                        if submitting {
                            ProgressView()
                        } else {
                            Text("Update password").font(.headline)
                        }
                        Spacer()
                    }
                }
                .disabled(!canSubmit)
            }
        }
        .navigationTitle("Change password")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func submit() async {
        guard let token = auth.token, canSubmit else { return }
        submitting = true
        errorMessage = nil
        defer { submitting = false }
        do {
            let _: OKResponse = try await api.send(
                path: "/api/mobile/account/password",
                method: "POST",
                token: token,
                body: ChangePasswordRequest(oldPassword: current, newPassword: newPassword)
            )
            didSucceed = true
            // Let the success state register, then return to Account.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                presentationMode.wrappedValue.dismiss()
            }
        } catch APIError.badStatus(403) {
            errorMessage = "Your current password is incorrect."
        } catch APIError.badStatus(400) {
            errorMessage = "That new password isn't allowed — try a stronger one."
        } catch {
            errorMessage = "Couldn't update your password. Please try again."
        }
    }
}
