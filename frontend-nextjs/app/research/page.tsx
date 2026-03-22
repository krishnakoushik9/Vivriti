import ResearchPanel from "@/components/ResearchPanel";

export default function ResearchLabPage() {
    return (
        <main style={{
            maxWidth: 900,
            margin: "48px auto",
            padding: "0 24px"
        }}>
            <h1 style={{
                fontSize: 24,
                fontWeight: 600,
                color: "#0A0A0A",
                marginBottom: 8
            }}>
                Research Lab
            </h1>
            <p style={{
                fontSize: 14,
                color: "#6B6B6B",
                marginBottom: 32
            }}>
                Ad-hoc company intelligence lookup.
                Not linked to any credit application.
            </p>
            <ResearchPanel />
        </main>
    );
}
