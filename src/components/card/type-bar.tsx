import { JSX } from "solid-js/jsx-runtime";
import { Card } from "../../types/card";

type TypeBarProps = {
	type: string;
	category: Card["category"];
};

const style: Record<Card["category"], JSX.CSSProperties> = {
	Planeswalker: {
		top: "49.4mm",
		left: "4.7mm",
		right: "4.6mm",
		height: "4.3mm",
		position: "absolute",
	},
	Regular: {
		top: "49.6mm",
		left: "4.7mm",
		right: "4.6mm",
		height: "5mm",
	},
};

export default function TypeBar(props: TypeBarProps) {
	return (
		<div
			style={{
				display: "flex",
				"align-items": "center",
				position: "absolute",
				"z-index": 2,
				...style[props.category],
			}}
		>
			<h1
				style={{
					margin: 0,
					"margin-left": "0.5mm",
					"font-family": "Beleren",
					"--rows": props.type.length,
					"font-size": `clamp(6pt, (200px) / var(--rows) * 2, 9pt)`,
					flex: 1,
				}}
			>
				{props.type}
			</h1>
		</div>
	);
}
