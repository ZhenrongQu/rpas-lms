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

                Link(destination: URL(string: "https://pacificdrone.ca/en/signin")!) {
                    Text("Need an account or password reset?")
                        .font(.footnote)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }

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
