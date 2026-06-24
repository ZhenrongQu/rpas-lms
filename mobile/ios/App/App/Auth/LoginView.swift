import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: 20) {
                Spacer()

                Text("Pacific Drone")
                    .font(.largeTitle.bold())
                    .foregroundColor(AppTheme.ink)
                Text("Sign in to continue your RPAS training.")
                    .foregroundColor(AppTheme.secondaryInk)

                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                    .textFieldStyle(RoundedBorderTextFieldStyle())

                SecureField("Password", text: $password)
                    .textFieldStyle(RoundedBorderTextFieldStyle())

                if let error = auth.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundColor(.red)
                }

                Button {
                    Task { await auth.signIn(email: email, password: password) }
                } label: {
                    Text("Sign In")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .foregroundColor(.white)
                .background(email.isEmpty || password.isEmpty ? AppTheme.border : AppTheme.accent)
                .cornerRadius(10)
                .disabled(email.isEmpty || password.isEmpty)

                Link("Need an account or password reset?", destination: URL(string: "https://pacificdrone.ca/en/signin")!)
                    .font(.footnote)

                Spacer()
            }
            .padding(24)
            .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
        }
    }
}
