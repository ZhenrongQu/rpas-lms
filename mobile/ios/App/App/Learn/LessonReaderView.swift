import SwiftUI

struct LessonReaderView: View {
    let lesson: MobileLessonResponse

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(lesson.meta.title)
                    .font(.title.bold())
                    .foregroundColor(AppTheme.ink)
                ForEach(lesson.blocks) { block in
                    switch block {
                    case .heading(let level, let text):
                        Text(text)
                            .font(level == 1 ? .title2.bold() : .headline)
                            .foregroundColor(AppTheme.ink)
                    case .paragraph(let text):
                        Text(text)
                            .foregroundColor(AppTheme.secondaryInk)
                    case .list(_, let items):
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(items, id: \.self) { item in
                                Text("- \(item)")
                                    .foregroundColor(AppTheme.ink)
                            }
                        }
                    case .callout(_, let text):
                        Text(text)
                            .foregroundColor(AppTheme.ink)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(AppTheme.accentSoft)
                            .cornerRadius(12)
                    }
                }
            }
            .padding()
        }
        .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
    }
}
