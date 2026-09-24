import { features } from '@/lib/features';

/**
 * The feature list as bullets for MDX, from the same source as the landing page
 * cards.
 */
export function FeatureList() {
    return (
        <ul>
            {features.map((feature) => (
                <li key={feature.title}>
                    <strong>{feature.title}</strong>: {feature.description}
                </li>
            ))}
        </ul>
    );
}
