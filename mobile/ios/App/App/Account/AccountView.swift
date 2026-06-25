import SwiftUI

struct AccountView: View {
    @EnvironmentObject var auth: AuthViewModel

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

                Section(header: Text("Manage on the web")) {
                    Link(destination: URL(string: "https://pacificdrone.ca/en/billing")!) {
                        Label("Subscription & billing", systemImage: "creditcard")
                    }
                    Link(destination: URL(string: "https://pacificdrone.ca/en/signin")!) {
                        Label("Account & password", systemImage: "person.crop.circle")
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
            }
            .navigationTitle("Account")
        }
    }

    private func tierLabel(_ tier: String) -> String {
        tier == "PAID" ? "Full access" : "Free plan"
    }
}
