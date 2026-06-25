import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    private var canSubmit: Bool { !email.isEmpty && !password.isEmpty }

    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: AppTheme.gap) {
                VStack(alignment: .leading, spacing: AppTheme.gapSmall) {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 40))
                        .foregroundColor(AppTheme.accent)
                        .padding(.bottom, 4)
                    Text("Pacific Drone")
                        .font(.largeTitle.bold())
                        .foregroundColor(AppTheme.ink)
                    Text("Sign in to continue your RPAS training.")
                        .font(.subheadline)
                        .foregroundColor(AppTheme.secondaryInk)
                }
                .padding(.bottom, AppTheme.gapSmall)

                VStack(spacing: 12) {
                    field {
                        TextField("Email", text: $email)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                    }
                    field {
                        SecureField("Password", text: $password)
                    }
                }

                if let error = auth.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundColor(.red)
                }

                Button {
                    Task { await auth.signIn(email: email, password: password) }
                } label: {
                    Text("Sign In")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!canSubmit)

                HStack {
                    NavigationLink {
                        ForgotPasswordView()
                    } label: {
                        Text("Forgot password?")
                            .font(.footnote)
                    }
                    Spacer()
                    NavigationLink {
                        RegisterView()
                    } label: {
                        Text("Create account")
                            .font(.footnote.bold())
                            .foregroundColor(AppTheme.accent)
                    }
                }
                .frame(minHeight: 44)

                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 72)
            .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
        }
    }

    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .foregroundColor(AppTheme.ink)
            .padding(12)
            .background(AppTheme.surface)
            .cornerRadius(AppTheme.cornerSmall)
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.cornerSmall)
                    .stroke(AppTheme.border, lineWidth: 1)
            )
    }
}

/// Reusable bordered input wrapper, matching the login fields.
struct AuthField<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .foregroundColor(AppTheme.ink)
            .padding(12)
            .background(AppTheme.surface)
            .cornerRadius(AppTheme.cornerSmall)
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.cornerSmall)
                    .stroke(AppTheme.border, lineWidth: 1)
            )
    }
}

private struct ForgotPasswordRequest: Encodable {
    let email: String
    let locale: String
}

/// Native "send me a reset link" screen → POST /api/mobile/auth/forgot-password.
/// The reset itself happens via the emailed web link.
struct ForgotPasswordView: View {
    @State private var email = ""
    @State private var submitting = false
    @State private var sent = false
    @State private var errorMessage: String?

    private let api = APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)

    private var canSubmit: Bool { email.contains("@") && !submitting }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.gap) {
            Text("Reset your password")
                .font(.title2.bold())
                .foregroundColor(AppTheme.ink)
            Text("Enter your email and we'll send a reset link. Open it to choose a new password.")
                .font(.subheadline)
                .foregroundColor(AppTheme.secondaryInk)

            AuthField {
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
            }

            if sent {
                Label("If an account exists for that email, a reset link is on its way.",
                      systemImage: "envelope.fill")
                    .font(.footnote)
                    .foregroundColor(AppTheme.green)
            }
            if let errorMessage = errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundColor(.red)
            }

            Button {
                Task { await submit() }
            } label: {
                Text(submitting ? "Sending…" : "Send reset link")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canSubmit)

            Spacer()
        }
        .padding(.horizontal, 24)
        .padding(.top, 32)
        .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
        .navigationTitle("Forgot password")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func submit() async {
        guard canSubmit else { return }
        submitting = true
        errorMessage = nil
        defer { submitting = false }
        do {
            let _: OKResponse = try await api.send(
                path: "/api/mobile/auth/forgot-password",
                method: "POST",
                body: ForgotPasswordRequest(email: email, locale: "en")
            )
            sent = true
        } catch {
            errorMessage = "Couldn't send the reset link. Please try again."
        }
    }
}

private struct RegisterRequest: Encodable {
    let email: String
    let password: String
}

private struct VerifyEmailRequest: Encodable {
    let email: String
    let code: String
}

/// Native sign-up: create the account, verify the emailed 6-digit code, then
/// sign straight in. → POST /api/mobile/auth/register + /verify-email.
struct RegisterView: View {
    @EnvironmentObject var auth: AuthViewModel

    private enum Phase { case details, verify }

    @State private var phase: Phase = .details
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var code = ""
    @State private var submitting = false
    @State private var errorMessage: String?

    private let api = APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)

    private var canRegister: Bool {
        email.contains("@") && password.count >= 8 && password == confirm && !submitting
    }
    private var canVerify: Bool { code.count == 6 && !submitting }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.gap) {
            switch phase {
            case .details: detailsForm
            case .verify: verifyForm
            }

            if let errorMessage = errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundColor(.red)
            }

            Spacer()
        }
        .padding(.horizontal, 24)
        .padding(.top, 32)
        .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
        .navigationTitle("Create account")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var detailsForm: some View {
        Group {
            Text("Join Pacific Drone")
                .font(.title2.bold())
                .foregroundColor(AppTheme.ink)
            AuthField {
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
            }
            AuthField { SecureField("Password (8+ characters)", text: $password) }
            AuthField { SecureField("Confirm password", text: $confirm) }

            if password.isEmpty == false, confirm.isEmpty == false, password != confirm {
                Text("Passwords don't match.")
                    .font(.footnote)
                    .foregroundColor(.red)
            }

            Button {
                Task { await register() }
            } label: {
                Text(submitting ? "Creating…" : "Create account")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canRegister)
        }
    }

    private var verifyForm: some View {
        Group {
            Text("Verify your email")
                .font(.title2.bold())
                .foregroundColor(AppTheme.ink)
            Text("We sent a 6-digit code to \(email). Enter it below.")
                .font(.subheadline)
                .foregroundColor(AppTheme.secondaryInk)
            AuthField {
                TextField("6-digit code", text: $code)
                    .keyboardType(.numberPad)
            }
            Button {
                Task { await verify() }
            } label: {
                Text(submitting ? "Verifying…" : "Verify & sign in")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canVerify)
        }
    }

    private func register() async {
        guard canRegister else { return }
        submitting = true
        errorMessage = nil
        defer { submitting = false }
        do {
            let _: OKResponse = try await api.send(
                path: "/api/mobile/auth/register",
                method: "POST",
                body: RegisterRequest(email: email, password: password)
            )
            phase = .verify
        } catch APIError.badStatus(409) {
            errorMessage = "That email is already registered. Try signing in."
        } catch APIError.badStatus(400) {
            errorMessage = "Please use a valid email and a stronger password (8+ characters)."
        } catch {
            errorMessage = "Couldn't create your account. Please try again."
        }
    }

    private func verify() async {
        guard canVerify else { return }
        submitting = true
        errorMessage = nil
        defer { submitting = false }
        do {
            let _: OKResponse = try await api.send(
                path: "/api/mobile/auth/verify-email",
                method: "POST",
                body: VerifyEmailRequest(email: email, code: code)
            )
            // Verified — sign in; AppRootView swaps to the app on success.
            await auth.signIn(email: email, password: password)
        } catch {
            errorMessage = "That code is incorrect or expired. Check your email and retry."
        }
    }
}
