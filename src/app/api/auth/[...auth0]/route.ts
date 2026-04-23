import { handleAuth } from "@auth0/nextjs-auth0";

const auth0Handler = handleAuth();

const isAuth0Configured = [
	"AUTH0_SECRET",
	"AUTH0_BASE_URL",
	"AUTH0_ISSUER_BASE_URL",
	"AUTH0_CLIENT_ID",
	"AUTH0_CLIENT_SECRET",
].every((key) => {
	const value = process.env[key];
	return typeof value === "string" && value.trim().length > 0;
});

export async function GET(
	request: Request,
	context: { params: { auth0?: string[] } },
) {
	if (!isAuth0Configured) {
		const action = context.params.auth0?.[0];

		if (action === "me") {
			return Response.json(null);
		}

		return Response.json(
			{ error: "Auth0 is not configured" },
			{ status: 503 },
		);
	}

	return auth0Handler(request, context);
}
